import { Action, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { EfsMountTarget } from '../efs-mount-target.resource.js';

/**
 * @internal
 */
@Action(EfsMountTarget)
export class UpdateEfsMountTargetTagsResourceAction implements IResourceAction<EfsMountTarget> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof EfsMountTarget &&
      (diff.node.constructor as typeof EfsMountTarget).NODE_NAME === 'efs-mount-target' &&
      diff.field === 'tags'
    );
  }

  async handle(): Promise<void> {}

  async mock(): Promise<void> {}
}

/**
 * @internal
 */
@Factory<UpdateEfsMountTargetTagsResourceAction>(UpdateEfsMountTargetTagsResourceAction)
export class UpdateEfsMountTargetTagsResourceActionFactory {
  private static instance: UpdateEfsMountTargetTagsResourceAction;

  static async create(): Promise<UpdateEfsMountTargetTagsResourceAction> {
    if (!this.instance) {
      this.instance = new UpdateEfsMountTargetTagsResourceAction();
    }
    return this.instance;
  }
}
