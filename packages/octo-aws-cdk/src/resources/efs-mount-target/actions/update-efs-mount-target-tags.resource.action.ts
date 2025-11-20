import { Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EfsMountTarget } from '../efs-mount-target.resource.js';
import type { EfsMountTargetSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(EfsMountTarget)
export class UpdateEfsMountTargetTagsResourceAction implements IResourceAction<EfsMountTarget> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof EfsMountTarget &&
      hasNodeName(diff.node, 'efs-mount-target') &&
      diff.field === 'tags'
    );
  }

  async handle(diff: Diff<EfsMountTarget>): Promise<EfsMountTargetSchema['response']> {
    const efsMountTarget = diff.node;
    return efsMountTarget.response;
  }

  async mock(diff: Diff<EfsMountTarget>): Promise<EfsMountTargetSchema['response']> {
    const efsMountTarget = diff.node;
    return efsMountTarget.response;
  }
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
