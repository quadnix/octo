import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EcrImageTag } from '../ecr-image-tag.resource.js';

/**
 * Retires a published image, which stays in its repository to roll back to. The repository's
 * lifecycle policy expires it once `imageTagsToKeep` newer images were published.
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
    const properties = diff.node.properties;
    this.log(diff, `Keeping "${properties.imageId}:${properties.imageTag}" until the repository expires it`);
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
