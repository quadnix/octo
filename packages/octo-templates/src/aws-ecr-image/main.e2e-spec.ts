import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { dump, load } from 'js-yaml';
import { AwsEcsUtility } from '../utilities/aws/ecs/aws-ecs.utility.js';
import { AwsLiveResourcesUtility } from '../utilities/aws/live-resources/aws-live-resources.utility.js';
import { AwsTagsUtility } from '../utilities/aws/tags/aws-tags.utility.js';
import { OctoCliUtility } from '../utilities/octo/octo-cli.utility.js';
import { config } from './app.config.js';
import { ImageRepository } from './image.repository.js';
import { TaskDefinitionRepository } from './task-definition.repository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';

const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-ecr-image' };

/**
 * A repository name of this run's own, because ECR deletes a repository asynchronously: recreating
 * one seconds after destroying it can be served the repository that is still going away, images and
 * all, and an immutable tag then refuses the push. A run that fails before its teardown leaves the
 * name behind, and the next run destroys it - octo no longer declares it.
 */
const IMAGE_NAME = `octo-ecr-image-${Date.now().toString(36)}`;

const REPOSITORY_NAME = `quadnix/${IMAGE_NAME}`;

/**
 * The second repository, which one of the cases moves a published image into.
 */
const OTHER_IMAGE_NAME = `${IMAGE_NAME}-other`;

const OTHER_REPOSITORY_NAME = `quadnix/${OTHER_IMAGE_NAME}`;

const STATE_DIRECTORY_PATH = join(__dirname, '.octo', 'state');

const STATE_FILE_PATH = join(STATE_DIRECTORY_PATH, 'resources-actual.json');

const OUTPUT_DIRECTORY = join('.octo', 'generated');

interface Definition {
  modules: { moduleClass: string; moduleId: string; moduleInputs: Record<string, unknown> }[];
  settings: { stateProvider: { statePath: string } };
}

/**
 * The version the ECS consumer runs, and the URI AWS is expected to be given for it.
 */
const ECS_IMAGE_TAG = '0.1.0';

const ECS_IMAGE_URI = `${config.AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION_ID}.amazonaws.com/${REPOSITORY_NAME}:${ECS_IMAGE_TAG}`;

/**
 * A definition of this template's own, derived from `baseFileName` by the given edit, if any.
 *
 * The cases below are structural - another version published beside the first, a version dropped, a
 * version moved to another repository - so they are changes to the modules a definition declares
 * rather than to the values fed into one. Each is written beside the state directory, keeping the
 * same definition directory, which is what anchors the state path every run has to reuse.
 */
async function writeDefinition(
  name: string,
  baseFileName: string,
  edit: (definition: Definition) => void = () => undefined,
): Promise<string> {
  const definition = load(await readFile(join(__dirname, baseFileName), 'utf8')) as Definition;

  edit(definition);
  definition.settings.stateProvider.statePath = 'state';

  const definitionFilePath = join(__dirname, '.octo', `${name}.yaml`);
  await mkdir(join(__dirname, '.octo'), { recursive: true });
  await writeFile(definitionFilePath, dump(definition));

  return definitionFilePath;
}

/**
 * The module publishing a version, as a definition declares it.
 */
function imageTagModule(
  moduleId: string,
  {
    dockerfileName = 'Dockerfile',
    image = '${{image-module.model.image}}',
    imageTag,
  }: { dockerfileName?: string; image?: string; imageTag: string },
): Definition['modules'][0] {
  return {
    moduleClass: 'AwsEcrImageTagModule',
    moduleId,
    moduleInputs: { architecture: 'x86_64', dockerfileDirectory: 'image', dockerfileName, image, imageTag },
  };
}

/**
 * The second repository, as a definition declares it.
 */
function otherRepositoryModule(): Definition['modules'][0] {
  return {
    moduleClass: 'AwsEcrImageModule',
    moduleId: 'image-module-2',
    moduleInputs: {
      imageFamily: 'quadnix',
      imageName: OTHER_IMAGE_NAME,
      regions: ['${{region-module.model.region}}'],
    },
  };
}

/**
 * The ARN octo committed for the task definition, read back out of octo state.
 *
 * The ARN rather than the family name, because a family names its newest revision and this asserts
 * the revision the run registered.
 */
async function readCommittedTaskDefinitionArn(): Promise<string> {
  const state = JSON.parse(await readFile(STATE_FILE_PATH, 'utf8')) as {
    data: { resources: { [context: string]: { resource: { response: Record<string, string> } } } };
  };

  const entry = Object.entries(state.data.resources).find(([context]) => context.includes('ecs-task-definition='));
  if (!entry) {
    throw new Error('Octo state holds no task definition!');
  }

  return entry[1].resource.response.taskDefinitionArn;
}

/**
 * The responses octo committed for the published images, keyed by tag, read back out of octo state.
 *
 * This is the far end of an external resource's response path: the action returns it, terraform
 * carries it through `data "external"` into a folder output, and commit records it here.
 */
async function readCommittedResponses(): Promise<{ [imageTag: string]: Record<string, string> }> {
  const state = JSON.parse(await readFile(STATE_FILE_PATH, 'utf8')) as {
    data: { resources: { [context: string]: { resource: { response: Record<string, string> } } } };
  };

  return Object.fromEntries(
    Object.entries(state.data.resources)
      .filter(([context]) => context.includes('ecr-image-tag='))
      .map(([, entry]) => [entry.resource.response.imageTag, entry.resource.response]),
  );
}

/**
 * Deletes every terragrunt cache under the generated folders, which is what a checkout on another
 * machine starts from. Terragrunt copies each unit into a cache and runs terraform there, so
 * anything an apply leaves on disk is in the cache and nowhere else; terraform's own state is kept
 * in the unit folder and survives.
 */
async function removeTerragruntCaches(): Promise<void> {
  const generatedDirectory = join(__dirname, '.octo', 'generated');

  for (const moduleDirectory of await readdir(generatedDirectory)) {
    await rm(join(generatedDirectory, moduleDirectory, '.terragrunt-cache'), { force: true, recursive: true });
  }
}

/**
 * The records an external resource's action leaves in octo state, one per resource.
 *
 * A record exists only between the action that wrote it and the commit that folds it into the
 * resource graph, so a settled state directory holds none.
 */
async function readStateRecordNames(): Promise<string[]> {
  const names = await readdir(STATE_DIRECTORY_PATH);
  return names.filter((name) => name.startsWith('resource-state-')).sort();
}

jest.setTimeout(3_600_000);

describe('Main E2E', () => {
  const environment = { AWS_ACCOUNT_ID: config.AWS_ACCOUNT_ID, AWS_IMAGE_NAME: IMAGE_NAME };

  let imageRepository: ImageRepository;
  let taskDefinitionRepository: TaskDefinitionRepository;

  beforeAll(async () => {
    imageRepository = new ImageRepository(AWS_REGION_ID);
    taskDefinitionRepository = new TaskDefinitionRepository(AWS_REGION_ID);
  });

  it('should build the image and publish it into the repository it creates', async () => {
    await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', { ...environment, AWS_IMAGE_TAG: '0.0.1' });

    const imageDigest = await imageRepository.getImageDigest(REPOSITORY_NAME, '0.0.1');
    expect(imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

    // The record the action wrote mid-apply is gone: the committed graph holds it now.
    expect(await readStateRecordNames()).toEqual([]);

    // The response the action produced mid-apply reached octo state, digest and all.
    expect(await readCommittedResponses()).toEqual({
      '0.0.1': {
        imageDigest,
        imageTag: '0.0.1',
        imageUri: `${config.AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION_ID}.amazonaws.com/${REPOSITORY_NAME}:0.0.1`,
        registryId: config.AWS_ACCOUNT_ID,
        repositoryName: REPOSITORY_NAME,
      },
    });
  });

  it('should record no change when nothing moved', async () => {
    await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', { ...environment, AWS_IMAGE_TAG: '0.0.1' });

    expect(Object.keys(await readCommittedResponses())).toEqual(['0.0.1']);
  });

  // A published response has to outlive the machine that published it: terraform reads it back on
  // every plan, and the only durable copy is the one in octo state.
  it('should plan and apply from a checkout holding no terragrunt cache', async () => {
    const publishedDigest = await imageRepository.getImageDigest(REPOSITORY_NAME, '0.0.1');
    await removeTerragruntCaches();

    await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', { ...environment, AWS_IMAGE_TAG: '0.0.1' });

    // Nothing was republished, and the response came back unchanged.
    expect(await imageRepository.getImageDigest(REPOSITORY_NAME, '0.0.1')).toEqual(publishedDigest);
    expect((await readCommittedResponses())['0.0.1'].imageDigest).toEqual(publishedDigest);
  });

  it('should publish another version alongside the one already there', async () => {
    const definitionFilePath = await writeDefinition('two-versions', 'octo.yaml', (definition) => {
      definition.modules.push(imageTagModule('image-tag-module-2', { imageTag: '0.0.2' }));
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, { ...environment, AWS_IMAGE_TAG: '0.0.1' });

    expect(await imageRepository.getImageDigest(REPOSITORY_NAME, '0.0.1')).toMatch(/^sha256:/);
    expect(await imageRepository.getImageDigest(REPOSITORY_NAME, '0.0.2')).toMatch(/^sha256:/);
    expect(Object.keys(await readCommittedResponses()).sort()).toEqual(['0.0.1', '0.0.2']);
  });

  it('should delete only the version it stops declaring', async () => {
    const definitionFilePath = await writeDefinition('one-version-dropped', 'octo.yaml', (definition) => {
      definition.modules = definition.modules.filter((m) => m.moduleId !== 'image-tag-module');
      definition.modules.push(imageTagModule('image-tag-module-2', { imageTag: '0.0.2' }));
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    expect(await imageRepository.getImageDigest(REPOSITORY_NAME, '0.0.1')).toBeNull();
    expect(await imageRepository.getImageDigest(REPOSITORY_NAME, '0.0.2')).toMatch(/^sha256:/);
    // The repository itself is untouched by a version leaving it.
    expect(await imageRepository.hasRepository(REPOSITORY_NAME)).toBe(true);
  });

  it('should delete the old version and publish the new one when the tag is edited in place', async () => {
    const definitionFilePath = await writeDefinition('tag-edited', 'octo.yaml', (definition) => {
      definition.modules = definition.modules.filter((m) => m.moduleId !== 'image-tag-module');
      definition.modules.push(imageTagModule('image-tag-module-2', { imageTag: '0.0.3' }));
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    expect(await imageRepository.getImageDigest(REPOSITORY_NAME, '0.0.2')).toBeNull();
    expect(await imageRepository.getImageDigest(REPOSITORY_NAME, '0.0.3')).toMatch(/^sha256:/);
    expect(Object.keys(await readCommittedResponses())).toEqual(['0.0.3']);
  });

  it('should leave the published image alone when what it is built from changes', async () => {
    const publishedDigest = await imageRepository.getImageDigest(REPOSITORY_NAME, '0.0.3');

    const definitionFilePath = await writeDefinition('rebuilt', 'octo.yaml', (definition) => {
      definition.modules = definition.modules.filter((m) => m.moduleId !== 'image-tag-module');
      definition.modules.push(
        imageTagModule('image-tag-module-2', { dockerfileName: 'Dockerfile.replacement', imageTag: '0.0.3' }),
      );
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    // A tag holds what was pushed under it, and it is immutable. Pointing the build somewhere else
    // publishes nothing: the way to publish something else is to publish another tag.
    expect(await imageRepository.getImageDigest(REPOSITORY_NAME, '0.0.3')).toEqual(publishedDigest);
    expect((await readCommittedResponses())['0.0.3'].imageDigest).toEqual(publishedDigest);
  });

  it('should move the published image when it is pointed at another repository', async () => {
    const definitionFilePath = await writeDefinition('other-repository', 'octo.yaml', (definition) => {
      definition.modules = definition.modules.filter((m) => m.moduleId !== 'image-tag-module');
      definition.modules.push(otherRepositoryModule());
      definition.modules.push(
        imageTagModule('image-tag-module-2', {
          dockerfileName: 'Dockerfile.replacement',
          image: '${{image-module-2.model.image}}',
          imageTag: '0.0.3',
        }),
      );
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    expect(await imageRepository.getImageDigest(REPOSITORY_NAME, '0.0.3')).toBeNull();
    expect(await imageRepository.getImageDigest(OTHER_REPOSITORY_NAME, '0.0.3')).toMatch(/^sha256:/);
    expect((await readCommittedResponses())['0.0.3'].repositoryName).toEqual(OTHER_REPOSITORY_NAME);
  });

  // An apply that is never committed is the shape a killed pipeline leaves behind. The record its
  // action wrote is the only place the published image is written down until the commit lands, and
  // a second apply must read it rather than publish again.
  it('should not republish when an apply is re-run before its commit', async () => {
    const definitionFilePath = await writeDefinition('uncommitted', 'octo.yaml', (definition) => {
      definition.modules = definition.modules.filter((m) => m.moduleId !== 'image-tag-module');
      definition.modules.push(otherRepositoryModule());
      definition.modules.push(
        imageTagModule('image-tag-module-2', {
          dockerfileName: 'Dockerfile.replacement',
          image: '${{image-module-2.model.image}}',
          imageTag: '0.0.3',
        }),
      );
      definition.modules.push(
        imageTagModule('image-tag-module-3', { image: '${{image-module-2.model.image}}', imageTag: '0.0.9' }),
      );
    });

    // Lock, generate and apply - and then stop, without committing.
    const lockId = (await OctoCliUtility.run(__dirname, definitionFilePath, ['lock'], environment)).trim();
    await OctoCliUtility.run(__dirname, definitionFilePath, ['generate', '--outputDir', OUTPUT_DIRECTORY], environment);
    await OctoCliUtility.run(
      __dirname,
      definitionFilePath,
      ['apply', '--terragruntDir', OUTPUT_DIRECTORY, '--lockId', lockId, '--auto-approve'],
      environment,
    );

    // The image is published, and octo has it recorded nowhere else yet.
    const pushedAt = await imageRepository.getImagePushedAt(OTHER_REPOSITORY_NAME, '0.0.9');
    expect(pushedAt).not.toBeNull();
    expect(await readStateRecordNames()).toHaveLength(1);
    expect(Object.keys(await readCommittedResponses()).sort()).toEqual(['0.0.3']);

    // A second apply over the same uncommitted state republishes nothing.
    await OctoCliUtility.run(
      __dirname,
      definitionFilePath,
      ['apply', '--terragruntDir', OUTPUT_DIRECTORY, '--lockId', lockId, '--auto-approve'],
      environment,
    );
    expect(await imageRepository.getImagePushedAt(OTHER_REPOSITORY_NAME, '0.0.9')).toEqual(pushedAt);

    // The commit folds the record into the graph and clears it.
    await OctoCliUtility.run(
      __dirname,
      definitionFilePath,
      ['commit', '--terragruntDir', OUTPUT_DIRECTORY, '--lockId', lockId],
      environment,
    );
    expect(await readStateRecordNames()).toEqual([]);
    expect(Object.keys(await readCommittedResponses()).sort()).toEqual(['0.0.3', '0.0.9']);
  });

  it('should publish nothing, and record nothing, when the image cannot be built', async () => {
    const definitionFilePath = await writeDefinition('build-fails', 'octo.yaml', (definition) => {
      definition.modules = definition.modules.filter((m) => m.moduleId !== 'image-tag-module');
      definition.modules.push(otherRepositoryModule());
      definition.modules.push(
        imageTagModule('image-tag-module-2', {
          dockerfileName: 'Dockerfile.replacement',
          image: '${{image-module-2.model.image}}',
          imageTag: '0.0.3',
        }),
      );
      definition.modules.push(
        imageTagModule('image-tag-module-3', { image: '${{image-module-2.model.image}}', imageTag: '0.0.9' }),
      );
      definition.modules.push(
        imageTagModule('image-tag-module-4', {
          dockerfileName: 'Dockerfile.missing',
          image: '${{image-module-2.model.image}}',
          imageTag: '0.0.10',
        }),
      );
    });

    await expect(OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment)).rejects.toThrow();

    // The action threw, so nothing was published and nothing was recorded for it.
    expect(await imageRepository.getImageDigest(OTHER_REPOSITORY_NAME, '0.0.10')).toBeNull();
    expect(await readStateRecordNames()).toEqual([]);
    // The versions that were already there are untouched.
    expect(await imageRepository.getImageDigest(OTHER_REPOSITORY_NAME, '0.0.9')).toMatch(/^sha256:/);
  });

  it('should publish on the next run once the build is fixed', async () => {
    const definitionFilePath = await writeDefinition('build-fixed', 'octo.yaml', (definition) => {
      definition.modules = definition.modules.filter((m) => m.moduleId !== 'image-tag-module');
      definition.modules.push(otherRepositoryModule());
      definition.modules.push(
        imageTagModule('image-tag-module-2', {
          dockerfileName: 'Dockerfile.replacement',
          image: '${{image-module-2.model.image}}',
          imageTag: '0.0.3',
        }),
      );
      definition.modules.push(
        imageTagModule('image-tag-module-3', { image: '${{image-module-2.model.image}}', imageTag: '0.0.9' }),
      );
      definition.modules.push(
        imageTagModule('image-tag-module-4', { image: '${{image-module-2.model.image}}', imageTag: '0.0.10' }),
      );
    });

    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    expect(await imageRepository.getImageDigest(OTHER_REPOSITORY_NAME, '0.0.10')).toMatch(/^sha256:/);
    expect(await readStateRecordNames()).toEqual([]);
    expect(Object.keys(await readCommittedResponses()).sort()).toEqual(['0.0.10', '0.0.3', '0.0.9']);
  });

  // The reason this template hosts an ECS stack at all. A task definition names a published image
  // through `getRef`, so the URI it is given comes back through octo's own response path: the
  // `data "external"` asks for a response nothing has recorded yet, terraform defers it because the
  // `null_resource` is planned to change, the provisioner publishes, the data source then answers,
  // and terragrunt carries the map into the folder holding the task definition. Both resources are
  // created by this one apply, which is the only run where every link in that chain is cold.
  it('should give a task definition the image the same apply published', async () => {
    const definitionFilePath = await writeDefinition('ecs-consumer', 'octo-ecs.yaml');

    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, {
      ...environment,
      AWS_IMAGE_TAG: ECS_IMAGE_TAG,
    });

    expect(await imageRepository.getImageDigest(REPOSITORY_NAME, ECS_IMAGE_TAG)).toMatch(/^sha256:/);

    // What AWS was handed, rather than what octo believes it handed over. An empty string here is
    // the failure this case exists to catch: a response that did not arrive before the task
    // definition was rendered.
    const taskDefinitionArn = await readCommittedTaskDefinitionArn();
    expect(await taskDefinitionRepository.getContainerImages(taskDefinitionArn)).toEqual([ECS_IMAGE_URI]);

    expect(await readStateRecordNames()).toEqual([]);
  });

  it('should have no resources left after teardown', async () => {
    // Derived from the ECS definition rather than from `octo.yaml`, because its imports are what
    // register the delete actions: a resource's actions come from importing the module path they sit
    // under, and the modules being dropped here are the ones that brought them.
    const definitionFilePath = await writeDefinition('teardown', 'octo-ecs.yaml', (definition) => {
      definition.modules = definition.modules.filter(
        (m) => m.moduleId === 'app-module' || m.moduleId === 'account-module',
      );
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    expect(await imageRepository.hasRepository(REPOSITORY_NAME)).toBe(false);
    expect(await imageRepository.hasRepository(OTHER_REPOSITORY_NAME)).toBe(false);

    const taggedArns = await new AwsTagsUtility(AWS_REGION_ID).getResourceArnsByTags(E2E_TAGS);

    // Destroying an `aws_ecs_task_definition` only retires the revision to INACTIVE, so reclaim the
    // retired revisions. Cleanup only: the delete is asynchronous and the revisions stay visible to
    // the tagging API well after this returns.
    const taskDefinitionArns = taggedArns.filter((arn) => arn.includes(':task-definition/'));
    if (taskDefinitionArns.length > 0) {
      const failures = await new AwsEcsUtility(AWS_REGION_ID).deleteTaskDefinitions(taskDefinitionArns);
      expect(failures).toEqual([]);
    }

    // Assert on what is still live: the tagging API keeps returning the ECS cluster, service and task
    // definition the consumer case registers, all of them destroyed, for far longer than a teardown
    // can wait.
    const liveArns = await new AwsLiveResourcesUtility(AWS_REGION_ID).filterLiveArns(taggedArns);
    expect(liveArns).toEqual([]);
  });
});
