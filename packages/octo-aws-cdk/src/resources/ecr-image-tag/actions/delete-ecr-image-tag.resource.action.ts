import { BatchDeleteImageCommand, ECRClient } from '@aws-sdk/client-ecr';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ECRClientFactory } from '../../../factories/aws-client.factory.js';
import { EcrImageTag } from '../ecr-image-tag.resource.js';

/**
 * Removes the published image from its repository.
 *
 * `octo commit` runs this, from the project directory, after terraform has destroyed the
 * `null_resource` that stood in for the image. A repository being destroyed in the same run is gone
 * by then, taking its images with it, so a repository or image AWS no longer knows about is treated
 * as already deleted rather than as a failure.
 *
 * @internal
 */
@Action(EcrImageTag)
export class DeleteEcrImageTagResourceAction extends ANodeAction implements IResourceAction<EcrImageTag> {
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
      diff.action === DiffAction.DELETE &&
      diff.node instanceof EcrImageTag &&
      hasNodeName(diff.node, 'ecr-image-tag') &&
      diff.field === 'resourceId'
    );
  }

  /**
   * @internal
   */
  async handle(diff: Diff<EcrImageTag>): Promise<void> {
    // Get properties.
    const ecrImageTag = diff.node;
    const properties = ecrImageTag.properties;

    // Get instances.
    const ecrClient = await this.container.get<ECRClient, typeof ECRClientFactory>(ECRClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete the image.
    this.log(diff, `Deleting "${properties.imageId}:${properties.imageTag}"`);
    try {
      await ecrClient.send(
        new BatchDeleteImageCommand({
          imageIds: [{ imageTag: properties.imageTag }],
          repositoryName: properties.imageId,
        }),
      );
    } catch (error) {
      if (error.name !== 'RepositoryNotFoundException' && error.name !== 'ImageNotFoundException') {
        throw error;
      }
    }
  }
}

/**
 * @internal
 */
@Factory<DeleteEcrImageTagResourceAction>(DeleteEcrImageTagResourceAction)
export class DeleteEcrImageTagResourceActionFactory {
  private static instance: DeleteEcrImageTagResourceAction;

  /**
   * @internal
   */
  static async create(): Promise<DeleteEcrImageTagResourceAction> {
    if (!this.instance) {
      this.instance = new DeleteEcrImageTagResourceAction();
    }
    return this.instance;
  }
}
