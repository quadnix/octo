import {
  BatchDeleteImageCommand,
  DescribeImagesCommand,
  ECRClient,
  GetAuthorizationTokenCommand,
} from '@aws-sdk/client-ecr';
import { jest } from '@jest/globals';
import { type Container, Diff, DiffAction, MatchingResource, TestContainer } from '@quadnix/octo';
import { DockerService } from '../../services/docker/docker.service.js';
import { EcrImage } from '../ecr/index.js';
import type { EcrImageSchema } from '../ecr/index.schema.js';
import { AddEcrImageTagResourceAction } from './actions/add-ecr-image-tag.resource.action.js';
import { DeleteEcrImageTagResourceAction } from './actions/delete-ecr-image-tag.resource.action.js';
import { EcrImageTag } from './ecr-image-tag.resource.js';

const AUTHORIZATION_TOKEN = Buffer.from('AWS:password').toString('base64');
const CREDENTIALS = {
  password: 'password',
  registryUri: 'https://123456789012.dkr.ecr.us-east-1.amazonaws.com',
  username: 'AWS',
};
const IMAGE_DIGEST = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const REPOSITORY_URI = '123456789012.dkr.ecr.us-east-1.amazonaws.com/family/image';

/**
 * The resource under test, wired to a repository that has already been applied - which is the state
 * terraform hands the action, having fed the repository's outputs in as `--input`.
 */
function createEcrImageTag(imageTag: string = '0.0.1'): EcrImageTag {
  const ecrImage = new EcrImage('ecr-us-east-1-family/image', {
    awsAccountId: '123456789012',
    awsRegionId: 'us-east-1',
    imageId: 'family/image',
    imageTagsToKeep: 5,
  });
  Object.assign(ecrImage.response, {
    registryId: '123456789012',
    repositoryArn: 'arn:aws:ecr:us-east-1:123456789012:repository/family/image',
    repositoryName: 'family/image',
    repositoryUri: REPOSITORY_URI,
  });

  return new EcrImageTag(
    `ecr-image-tag-us-east-1-family/image-${imageTag.replace(/[^\w-]/g, '-')}`,
    {
      architecture: 'arm64',
      awsAccountId: '123456789012',
      awsRegionId: 'us-east-1',
      buildArguments: {},
      buildSecrets: {},
      dockerfileDirectory: 'images/nginx',
      dockerfileName: 'Dockerfile',
      imageId: 'family/image',
      imageTag,
    },
    [new MatchingResource<EcrImageSchema>(ecrImage)],
  );
}

describe('EcrImageTag UT', () => {
  let container: Container;
  let dockerService: { build: jest.Mock; push: jest.Mock };
  let ecrClientSend: jest.Mock;

  beforeEach(async () => {
    // The repository holds the tag only once it was pushed.
    let isPushed = false;
    dockerService = {
      build: jest.fn(),
      push: jest.fn(async () => {
        isPushed = true;
      }),
    };
    ecrClientSend = jest.fn(async (command: unknown) => {
      if (command instanceof GetAuthorizationTokenCommand) {
        return {
          authorizationData: [
            {
              authorizationToken: AUTHORIZATION_TOKEN,
              proxyEndpoint: 'https://123456789012.dkr.ecr.us-east-1.amazonaws.com',
            },
          ],
        };
      }
      if (command instanceof DescribeImagesCommand) {
        if (!isPushed) {
          const error = new Error('The image does not exist');
          error.name = 'ImageNotFoundException';
          throw error;
        }
        return { imageDetails: [{ imageDigest: IMAGE_DIGEST }] };
      }
      return {};
    }) as unknown as jest.Mock;

    container = await TestContainer.create(
      {
        mocks: [
          { type: DockerService, value: dockerService },
          { metadata: { package: '@octo' }, type: ECRClient, value: { send: ecrClientSend } },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  describe('diff()', () => {
    it('should report no change when nothing changed', async () => {
      await expect(createEcrImageTag().diffProperties(createEcrImageTag())).resolves.toEqual([]);
    });

    it('should report no change when what the image is built from changes', async () => {
      const previous = createEcrImageTag();
      const current = createEcrImageTag();
      current.properties.dockerfileDirectory = 'images/other';
      current.properties.dockerfileName = 'Dockerfile.other';

      await expect(current.diffProperties(previous)).resolves.toEqual([]);
    });

    it('should keep the build inputs out of what terraform triggers on', () => {
      // Octo reports no change for them, so terraform must not plan a replacement for them either.
      expect(createEcrImageTag().getExternalTriggerProperties()).toEqual({});
    });

    it('should carry the publish and the delete of the whole image', () => {
      const ecrImageTag = createEcrImageTag();

      for (const action of [DiffAction.ADD, DiffAction.DELETE]) {
        const diff = new Diff(ecrImageTag, action, 'resourceId', ecrImageTag.getContext());
        expect(ecrImageTag.diffUnpack(diff)).toEqual([diff]);
      }
    });

    it('should discard everything the image does not own', () => {
      const ecrImageTag = createEcrImageTag();

      // ECR tags the repository, not the images inside it, and the repository carries its own.
      expect(
        ecrImageTag.diffUnpack(
          new Diff(ecrImageTag, DiffAction.UPDATE, 'tags', { add: { tag1: 'value1' }, delete: [], update: {} }),
        ),
      ).toEqual([]);
      // The repository is part of the image's properties, so a move to another one replaces it.
      expect(
        ecrImageTag.diffUnpack(new Diff(ecrImageTag, DiffAction.UPDATE, 'parent', ecrImageTag.parents[0].getActual())),
      ).toEqual([]);
    });
  });

  describe('AddEcrImageTagResourceAction', () => {
    it('should only handle the add of its own resource', async () => {
      const action = await container.get(AddEcrImageTagResourceAction);
      const ecrImageTag = createEcrImageTag();

      expect(action.filter(new Diff(ecrImageTag, DiffAction.ADD, 'resourceId', ecrImageTag.getContext()))).toBe(true);
      expect(action.filter(new Diff(ecrImageTag, DiffAction.UPDATE, 'properties', {}))).toBe(false);
      expect(action.filter(new Diff(ecrImageTag, DiffAction.DELETE, 'resourceId', ecrImageTag.getContext()))).toBe(
        false,
      );
      expect(action.filter(new Diff(ecrImageTag, DiffAction.REPLACE, 'resourceId', ecrImageTag.getContext()))).toBe(
        false,
      );
    });

    it('should throw error if ECR returns no authorization token', async () => {
      ecrClientSend.mockImplementation(async () => ({ authorizationData: [] }));

      const action = await container.get(AddEcrImageTagResourceAction);
      const ecrImageTag = createEcrImageTag();

      await expect(
        action.handle(new Diff(ecrImageTag, DiffAction.ADD, 'resourceId', ecrImageTag.getContext())),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"ECR returned no authorization token!"`);
    });

    it('should throw error if ECR reports no image under the tag', async () => {
      ecrClientSend.mockImplementation(async (command: unknown) =>
        command instanceof GetAuthorizationTokenCommand
          ? {
              authorizationData: [
                {
                  authorizationToken: AUTHORIZATION_TOKEN,
                  proxyEndpoint: 'https://123456789012.dkr.ecr.us-east-1.amazonaws.com',
                },
              ],
            }
          : { imageDetails: [] },
      );

      const action = await container.get(AddEcrImageTagResourceAction);
      const ecrImageTag = createEcrImageTag();

      await expect(
        action.handle(new Diff(ecrImageTag, DiffAction.ADD, 'resourceId', ecrImageTag.getContext())),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"ECR reports no image under tag "0.0.1" of repository "family/image"!"`,
      );
    });

    it('should build the image, push it, and report the digest AWS assigned', async () => {
      const action = await container.get(AddEcrImageTagResourceAction);
      const ecrImageTag = createEcrImageTag();

      const response = await action.handle(
        new Diff(ecrImageTag, DiffAction.ADD, 'resourceId', ecrImageTag.getContext()),
      );

      expect(dockerService.build).toHaveBeenCalledWith(
        `${REPOSITORY_URI}:0.0.1`,
        'linux/arm64',
        expect.stringMatching(/images\/nginx\/Dockerfile$/),
        expect.stringMatching(/images\/nginx$/),
        { buildArguments: {}, buildSecrets: {} },
        CREDENTIALS,
        expect.any(Function),
      );
      expect(dockerService.push).toHaveBeenCalledWith(`${REPOSITORY_URI}:0.0.1`, CREDENTIALS, expect.any(Function));

      expect(response).toEqual({
        imageDigest: IMAGE_DIGEST,
        imageTag: '0.0.1',
        imageUri: `${REPOSITORY_URI}:0.0.1`,
        registryId: '123456789012',
        repositoryName: 'family/image',
      });
    });

    it('should take a tag the repository already holds as it is, building nothing', async () => {
      ecrClientSend.mockImplementation(async (command: unknown) =>
        command instanceof DescribeImagesCommand ? { imageDetails: [{ imageDigest: IMAGE_DIGEST }] } : {},
      );

      const action = await container.get(AddEcrImageTagResourceAction);
      const ecrImageTag = createEcrImageTag();

      const response = await action.handle(
        new Diff(ecrImageTag, DiffAction.ADD, 'resourceId', ecrImageTag.getContext()),
      );

      expect(dockerService.build).not.toHaveBeenCalled();
      expect(dockerService.push).not.toHaveBeenCalled();
      expect(response).toEqual({
        imageDigest: IMAGE_DIGEST,
        imageTag: '0.0.1',
        imageUri: `${REPOSITORY_URI}:0.0.1`,
        registryId: '123456789012',
        repositoryName: 'family/image',
      });
    });

    it('should never remove anything from the registry', async () => {
      const action = await container.get(AddEcrImageTagResourceAction);
      const ecrImageTag = createEcrImageTag();

      await action.handle(new Diff(ecrImageTag, DiffAction.ADD, 'resourceId', ecrImageTag.getContext()));

      const commands = ecrClientSend.mock.calls.map(([command]) => command);
      expect(commands.some((command) => command instanceof BatchDeleteImageCommand)).toBe(false);
    });

    it('should resolve the build context against the octo project root', async () => {
      process.env.TF_VAR_OCTO_PROJECT_ROOT = '/octo-project';

      try {
        const action = await container.get(AddEcrImageTagResourceAction);
        const ecrImageTag = createEcrImageTag();

        await action.handle(new Diff(ecrImageTag, DiffAction.ADD, 'resourceId', ecrImageTag.getContext()));

        expect(dockerService.build).toHaveBeenCalledWith(
          `${REPOSITORY_URI}:0.0.1`,
          'linux/arm64',
          '/octo-project/images/nginx/Dockerfile',
          '/octo-project/images/nginx',
          { buildArguments: {}, buildSecrets: {} },
          expect.anything(),
          expect.any(Function),
        );
      } finally {
        delete process.env.TF_VAR_OCTO_PROJECT_ROOT;
      }
    });
  });

  describe('DeleteEcrImageTagResourceAction', () => {
    it('should only handle the delete of its own resource', async () => {
      const action = await container.get(DeleteEcrImageTagResourceAction);
      const ecrImageTag = createEcrImageTag();

      expect(action.filter(new Diff(ecrImageTag, DiffAction.DELETE, 'resourceId', ecrImageTag.getContext()))).toBe(
        true,
      );
      expect(action.filter(new Diff(ecrImageTag, DiffAction.ADD, 'resourceId', ecrImageTag.getContext()))).toBe(false);
    });

    it('should keep the published tag, sending ECR nothing', async () => {
      const action = await container.get(DeleteEcrImageTagResourceAction);
      const ecrImageTag = createEcrImageTag();

      await action.handle(new Diff(ecrImageTag, DiffAction.DELETE, 'resourceId', ecrImageTag.getContext()));

      expect(ecrClientSend).not.toHaveBeenCalled();
    });
  });
});
