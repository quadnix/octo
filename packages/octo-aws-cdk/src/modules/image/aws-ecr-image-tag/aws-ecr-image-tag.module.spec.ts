import { DescribeImagesCommand, ECRClient, GetAuthorizationTokenCommand } from '@aws-sdk/client-ecr';
import { jest } from '@jest/globals';
import { type App, type Image, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsEcrImageAnchorSchema } from '../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import { EcrImage } from '../../../resources/ecr/index.js';
import { DockerService } from '../../../services/docker/docker.service.js';
import { AwsEcrImageTagModule } from './index.js';

const AUTHORIZATION_TOKEN = Buffer.from('AWS:password').toString('base64');

/**
 * The docker CLI and the ECR API this module's resource action reaches for. Publishing runs those
 * actions for real even in a `skip` run - it is only terraform that such a run leaves out.
 */
let dockerService: { build: jest.Mock; login: jest.Mock; push: jest.Mock };

function createPublishingMocks(): { mocks: Parameters<typeof TestContainer.create>[0]['mocks'] } {
  dockerService = { build: jest.fn(), login: jest.fn(), push: jest.fn() };

  return {
    mocks: [
      { type: DockerService, value: dockerService },
      {
        metadata: { package: '@octo' },
        type: ECRClient,
        value: {
          send: jest.fn(async (command: unknown) => {
            if (command instanceof GetAuthorizationTokenCommand) {
              return {
                authorizationData: [{ authorizationToken: AUTHORIZATION_TOKEN, proxyEndpoint: 'https://registry' }],
              };
            }
            if (command instanceof DescribeImagesCommand) {
              return { imageDetails: [{ imageDigest: 'sha256:0123456789abcdef' }] };
            }
            return {};
          }),
        },
      },
    ],
  };
}

/**
 * An image whose repositories are already there, as the `AwsEcrImageModule` would have left them:
 * the model carrying the anchor this module joins, and one `EcrImage` per region it is in.
 */
async function setup(
  testModuleContainer: TestModuleContainer,
  {
    app,
    awsRegionIds = ['us-east-1'],
    imageName = 'image',
    moduleId = 'testModule',
  }: { app?: App; awsRegionIds?: string[]; imageName?: string; moduleId?: string } = {},
): Promise<App> {
  const {
    app: [testApp],
    image: [image],
  } = await testModuleContainer.createTestModels(moduleId, {
    app: [app ?? 'test-app'],
    image: [`family/${imageName}`],
  });

  image.addAnchor(
    testModuleContainer.createTestAnchor<AwsEcrImageAnchorSchema>(
      'AwsEcrImageAnchor',
      { imageId: image.imageId },
      image,
    ),
  );

  await testModuleContainer.createResources(
    moduleId,
    awsRegionIds.map(
      (awsRegionId) =>
        new EcrImage(`ecr-${awsRegionId}-${image.imageId}`, {
          awsAccountId: '123',
          awsRegionId,
          imageId: image.imageId,
        }),
    ),
    { save: true },
  );

  return testApp;
}

const imageTagModule = (
  moduleId: string,
  imageTag: string,
  {
    dockerfileDirectory = 'images/nginx',
    hidden = false,
    image = '${{testModule.model.image}}',
  }: { dockerfileDirectory?: string; hidden?: boolean; image?: string } = {},
): {
  hidden: boolean;
  inputs: { architecture: 'arm64' | 'x86_64'; dockerfileDirectory: string; image: Image; imageTag: string };
  moduleId: string;
  type: typeof AwsEcrImageTagModule;
} => ({
  hidden,
  inputs: { architecture: 'arm64', dockerfileDirectory, image: stub<Image>(image), imageTag },
  moduleId,
  type: AwsEcrImageTagModule,
});

describe('AwsEcrImageTagModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(createPublishingMocks(), { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-west-2');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsEcrImageTagModule>(
      imageTagModule('image-tag', '0.0.1'),
      { filterByModuleIds: ['image-tag'], terraformTarget: 'skip' },
    );

    const { hclRender, modelTransaction, resourceDiffs, resourceTransaction } = (await runModulesGenerator.next())
      .value!;
    expect(hclRender).toMatchSnapshot();
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcrImageTagOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddEcrImageTagResourceAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image-tag=ecr-image-tag-123-us-east-1-family/image-0-0-1-86a33f",
     ]
    `);

    // The Dockerfile name defaults, so the build reaches for one named `Dockerfile` in the context.
    expect(dockerService.build).toHaveBeenCalledWith(
      expect.stringContaining(':0.0.1'),
      'linux/arm64',
      expect.stringMatching(/images\/nginx\/Dockerfile$/),
      expect.stringMatching(/images\/nginx$/),
    );
  });

  it('should CUD', async () => {
    await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsEcrImageTagModule>(imageTagModule('image-tag', '0.0.1'), { terraformTarget: 'skip' })
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image-tag=ecr-image-tag-123-us-east-1-family/image-0-0-1-86a33f",
     ]
    `);

    await setup(testModuleContainer);
    const { hclDiff, resourceDiffs: resourceDiffsDelete } = (
      await testModuleContainer
        .runModules<AwsEcrImageTagModule>(imageTagModule('image-tag', '0.0.1', { hidden: true }), {
          terraformTarget: 'skip',
        })
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffsDelete)).toMatchInlineSnapshot(`
     [
       "- @octo/ecr-image-tag=ecr-image-tag-123-us-east-1-family/image-0-0-1-86a33f",
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  describe('publishing a version', () => {
    it('should publish into every repository the image has', async () => {
      await setup(testModuleContainer, { awsRegionIds: ['us-east-1', 'us-west-2'] });
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcrImageTagModule>(imageTagModule('image-tag', '0.0.1'), { terraformTarget: 'skip' })
          .next()
      ).value!;

      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "+ @octo/ecr-image-tag=ecr-image-tag-123-us-east-1-family/image-0-0-1-86a33f",
         "+ @octo/ecr-image-tag=ecr-image-tag-123-us-west-2-family/image-0-0-1-86a33f",
       ]
      `);
    });

    it('should publish another version alongside the one already there', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcrImageTagModule>(imageTagModule('image-tag-1', '1.0'), { terraformTarget: 'skip' })
        .next();

      await setup(testModuleContainer);
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcrImageTagModule>(
            [imageTagModule('image-tag-1', '1.0'), imageTagModule('image-tag-2', '1.1')],
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;

      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "+ @octo/ecr-image-tag=ecr-image-tag-123-us-east-1-family/image-1-1-86a33f",
       ]
      `);
    });

    it('should delete only the version it stops declaring', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcrImageTagModule>(
          [imageTagModule('image-tag-1', '1.0'), imageTagModule('image-tag-2', '1.1')],
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcrImageTagModule>(
            [imageTagModule('image-tag-1', '1.0', { hidden: true }), imageTagModule('image-tag-2', '1.1')],
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;

      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/ecr-image-tag=ecr-image-tag-123-us-east-1-family/image-1-0-86a33f",
       ]
      `);
    });

    it('should delete the old version and publish the new one when the tag is edited in place', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcrImageTagModule>(imageTagModule('image-tag', '0.0.1'), { terraformTarget: 'skip' })
        .next();

      await setup(testModuleContainer);
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcrImageTagModule>(imageTagModule('image-tag', '0.0.2'), { terraformTarget: 'skip' })
          .next()
      ).value!;

      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/ecr-image-tag=ecr-image-tag-123-us-east-1-family/image-0-0-1-86a33f",
         "+ @octo/ecr-image-tag=ecr-image-tag-123-us-east-1-family/image-0-0-2-86a33f",
       ]
      `);
    });

    it('should publish nothing when what the image is built from changes', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcrImageTagModule>(imageTagModule('image-tag', '0.0.1'), { terraformTarget: 'skip' })
        .next();

      await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcrImageTagModule>(
            imageTagModule('image-tag', '0.0.1', { dockerfileDirectory: 'images/api' }),
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;

      // The tag already published is immutable, so a build input that moved changes nothing. The
      // generated terraform triggers on nothing either, so it plans no replacement octo is silent on.
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });

    it('should republish into the new repository when the image is pointed at another one', async () => {
      const app = await setup(testModuleContainer);
      await setup(testModuleContainer, { app, imageName: 'other-image', moduleId: 'testOtherModule' });
      await testModuleContainer
        .runModules<AwsEcrImageTagModule>(imageTagModule('image-tag', '0.0.1'), { terraformTarget: 'skip' })
        .next();

      const appAgain = await setup(testModuleContainer);
      await setup(testModuleContainer, { app: appAgain, imageName: 'other-image', moduleId: 'testOtherModule' });
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcrImageTagModule>(
            imageTagModule('image-tag', '0.0.1', { image: '${{testOtherModule.model.image}}' }),
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;

      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/ecr-image-tag=ecr-image-tag-123-us-east-1-family/image-0-0-1-86a33f",
         "+ @octo/ecr-image-tag=ecr-image-tag-123-us-east-1-family/other-image-0-0-1-86a33f",
       ]
      `);
    });
  });

  describe('validation', () => {
    it('should validate the image is one whose repositories are in ECR', async () => {
      await testModuleContainer.createTestModels('testModule', { app: ['test-app'], image: ['family/image'] });

      await expect(
        testModuleContainer
          .runModules<AwsEcrImageTagModule>(imageTagModule('image-tag', '0.0.1'), { terraformTarget: 'skip' })
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "image" in schema could not be validated!"`);
    });

    it('should validate the image has a repository to publish into', async () => {
      const {
        image: [image],
      } = await testModuleContainer.createTestModels('testModule', { app: ['test-app'], image: ['family/image'] });
      image.addAnchor(
        testModuleContainer.createTestAnchor<AwsEcrImageAnchorSchema>(
          'AwsEcrImageAnchor',
          { imageId: image.imageId },
          image,
        ),
      );

      await expect(
        testModuleContainer
          .runModules<AwsEcrImageTagModule>(imageTagModule('image-tag', '0.0.1'), { terraformTarget: 'skip' })
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"ECR repository for image "family/image" not found!"`);
    });

    it('should validate dockerfileDirectory is not empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEcrImageTagModule>(imageTagModule('image-tag', '0.0.1', { dockerfileDirectory: '' }), {
            terraformTarget: 'skip',
          })
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Property "dockerfileDirectory" in schema could not be validated!"`,
      );
    });

    it('should validate imageTag is not empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEcrImageTagModule>(imageTagModule('image-tag', ''), { terraformTarget: 'skip' })
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "imageTag" in schema could not be validated!"`);
    });
  });
});
