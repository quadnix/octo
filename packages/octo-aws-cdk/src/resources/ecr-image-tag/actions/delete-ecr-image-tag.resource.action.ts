import { ECRClient } from '@aws-sdk/client-ecr';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ECRClientFactory } from '../../../factories/aws-client.factory.js';
import { EcrImageTagUtility } from '../../../utilities/ecr-image-tag/ecr-image-tag.utility.js';
import { EcrImageTag } from '../ecr-image-tag.resource.js';

/**
 * Removes the published image from its repository.
 *
 * `octo commit` runs this, from the project directory, after terraform has destroyed the
 * `null_resource` that stood in for the image.
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
    this.log(`Deleting "${properties.imageId}:${properties.imageTag}"`);
    await EcrImageTagUtility.delete(ecrClient, {
      imageTag: properties.imageTag,
      repositoryName: properties.imageId,
    });
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
