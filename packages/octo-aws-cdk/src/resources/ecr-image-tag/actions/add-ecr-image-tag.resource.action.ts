import { ECRClient } from '@aws-sdk/client-ecr';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ECRClientFactory } from '../../../factories/aws-client.factory.js';
import { DockerService, type DockerServiceFactory } from '../../../services/docker/docker.service.js';
import { EcrImageTagUtility } from '../../../utilities/ecr-image-tag/ecr-image-tag.utility.js';
import { EcrImageTag } from '../ecr-image-tag.resource.js';
import type { EcrImageTagSchema } from '../index.schema.js';

/**
 * Builds the image and publishes it into its repository.
 *
 * Terraform runs this mid-apply, through the `local-exec` provisioner octo generates for an external
 * resource, once the `aws_ecr_repository` it depends on exists.
 *
 * It also handles a replacement, which is a publish over a tag that already holds something. The
 * repository's tags are immutable, so that starts by deleting what is under the tag - and it is why
 * the two actions of this resource are still only an add and a delete.
 *
 * @internal
 */
@Action(EcrImageTag)
export class AddEcrImageTagResourceAction extends ANodeAction implements IResourceAction<EcrImageTag> {
  /**
   * A docker build pulls base layers and a push uploads them, both over the network, so the default
   * ninety seconds is not a useful bound on this.
   */
  readonly actionTimeoutInMs: number = 900_000;

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
      (diff.action === DiffAction.ADD || diff.action === DiffAction.REPLACE) &&
      diff.node instanceof EcrImageTag &&
      hasNodeName(diff.node, 'ecr-image-tag') &&
      diff.field === 'resourceId'
    );
  }

  /**
   * @internal
   */
  async handle(diff: Diff<EcrImageTag>): Promise<EcrImageTagSchema['response']> {
    // Get properties.
    const ecrImageTag = diff.node;
    const properties = ecrImageTag.properties;
    const { response: ecrImageResponse } = ecrImageTag.parents[0].getSchemaInstanceInResourceAction();

    // Get instances.
    const [dockerService, ecrClient] = await Promise.all([
      this.container.get<DockerService, typeof DockerServiceFactory>(DockerService),
      this.container.get<ECRClient, typeof ECRClientFactory>(ECRClient, {
        args: [properties.awsAccountId, properties.awsRegionId],
        metadata: { package: '@octo' },
      }),
    ]);

    // Clear the tag first when republishing: an immutable tag cannot be written twice.
    if (diff.action === DiffAction.REPLACE) {
      this.log(`Replacing "${properties.imageId}:${properties.imageTag}"`);
      await EcrImageTagUtility.delete(ecrClient, {
        imageTag: properties.imageTag,
        repositoryName: ecrImageResponse.repositoryName!,
      });
    }

    // Build the image and push it.
    this.log(`Publishing "${properties.imageId}:${properties.imageTag}"`);
    const { imageDigest, imageUri } = await EcrImageTagUtility.publish(dockerService, ecrClient, {
      dockerfileDirectory: properties.dockerfileDirectory,
      dockerfileName: properties.dockerfileName,
      imageTag: properties.imageTag,
      repositoryName: ecrImageResponse.repositoryName,
      repositoryUri: ecrImageResponse.repositoryUri,
    });

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
