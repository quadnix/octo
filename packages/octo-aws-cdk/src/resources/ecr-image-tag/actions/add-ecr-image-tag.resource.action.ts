import { join } from 'node:path';
import { DescribeImagesCommand, ECRClient, GetAuthorizationTokenCommand } from '@aws-sdk/client-ecr';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  ProjectUtility,
  hasNodeName,
} from '@quadnix/octo';
import type { ECRClientFactory } from '../../../factories/aws-client.factory.js';
import { DockerService, type DockerServiceFactory } from '../../../services/docker/docker.service.js';
import { EcrImageTag } from '../ecr-image-tag.resource.js';
import type { EcrImageTagSchema } from '../index.schema.js';

/**
 * Builds the image and publishes it into its repository.
 *
 * Terraform runs this mid-apply, through the `local-exec` provisioner octo generates for an external
 * resource, once the `aws_ecr_repository` it depends on exists.
 *
 * It only ever publishes. A tag is immutable and is part of the resource id, so the tag it writes
 * holds nothing yet, and retiring an older one is the delete action's work on its own resource.
 *
 * @internal
 */
@Action(EcrImageTag)
export class AddEcrImageTagResourceAction extends ANodeAction implements IResourceAction<EcrImageTag> {
  /**
   * An hour. This action builds the image as well as pushing it, so how long it takes is a fact
   * about the caller's Dockerfile and their link, and nothing a user of this module can raise. The
   * bound is here to end a hang, not to say how long a build ought to take.
   */
  readonly actionTimeoutInMs: number = 3_600_000;

  /**
   * @internal
   */
  constructor() {
    super();
  }

  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof EcrImageTag &&
      hasNodeName(diff.node, 'ecr-image-tag') &&
      diff.field === 'resourceId'
    );
  }

  /**
   * @internal
   * @throws If docker is unavailable, the build fails, the push is rejected, or AWS reports no image
   * under the tag afterwards.
   */
  async handle(diff: Diff<EcrImageTag>): Promise<EcrImageTagSchema['response']> {
    // Get properties.
    const ecrImageTag = diff.node;
    const properties = ecrImageTag.properties;
    const { response: ecrImageResponse } = ecrImageTag.parents[0].getSchemaInstanceInResourceAction();
    const imageUri = `${ecrImageResponse.repositoryUri}:${properties.imageTag}`;

    // Get instances.
    const [dockerService, ecrClient] = await Promise.all([
      this.container.get<DockerService, typeof DockerServiceFactory>(DockerService),
      this.container.get<ECRClient, typeof ECRClientFactory>(ECRClient, {
        args: [properties.awsAccountId, properties.awsRegionId],
        metadata: { package: '@octo' },
      }),
    ]);

    // Authenticate the docker CLI against the registry.
    const { authorizationData } = await ecrClient.send(new GetAuthorizationTokenCommand({}));
    const authorizationToken = authorizationData?.[0]?.authorizationToken;
    const proxyEndpoint = authorizationData?.[0]?.proxyEndpoint;
    if (!authorizationToken || !proxyEndpoint) {
      throw new Error('ECR returned no authorization token!');
    }
    const [username, password] = Buffer.from(authorizationToken, 'base64').toString('utf8').split(':');
    await dockerService.login(proxyEndpoint, username, password);

    // Build the image and push it. The build context is resolved against the octo project root
    // rather than the working directory: terraform runs this from a terragrunt cache directory.
    this.log(`Publishing "${properties.imageId}:${properties.imageTag}"`);
    const contextDirectory = ProjectUtility.resolveFromProjectRoot(properties.dockerfileDirectory);
    const platform = properties.architecture === 'arm64' ? 'linux/arm64' : 'linux/amd64';
    await dockerService.build(imageUri, platform, join(contextDirectory, properties.dockerfileName), contextDirectory);
    await dockerService.push(imageUri);

    // Read back the digest AWS assigned, which is the image's real identity.
    const { imageDetails } = await ecrClient.send(
      new DescribeImagesCommand({
        imageIds: [{ imageTag: properties.imageTag }],
        repositoryName: ecrImageResponse.repositoryName,
      }),
    );
    const imageDigest = imageDetails?.[0]?.imageDigest;
    if (!imageDigest) {
      throw new Error(
        `ECR reports no image under tag "${properties.imageTag}" of repository "${ecrImageResponse.repositoryName}"!`,
      );
    }

    return {
      imageDigest,
      imageTag: properties.imageTag,
      imageUri,
      registryId: ecrImageResponse.registryId,
      repositoryName: ecrImageResponse.repositoryName,
    };
  }
}

/**
 * @internal
 */
@Factory<AddEcrImageTagResourceAction>(AddEcrImageTagResourceAction)
export class AddEcrImageTagResourceActionFactory {
  private static instance: AddEcrImageTagResourceAction;

  /**
   * @internal
   */
  static async create(): Promise<AddEcrImageTagResourceAction> {
    if (!this.instance) {
      this.instance = new AddEcrImageTagResourceAction();
    }
    return this.instance;
  }
}
