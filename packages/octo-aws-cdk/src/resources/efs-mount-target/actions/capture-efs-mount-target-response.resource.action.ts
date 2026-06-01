import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EfsMountTarget } from '../efs-mount-target.resource.js';
import type { EfsMountTargetSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(EfsMountTarget)
export class CaptureEfsMountTargetResponseResourceAction implements IResourceAction<EfsMountTarget> {
  filter(diff: Diff): boolean {
    return diff.node instanceof EfsMountTarget && hasNodeName(diff.node, 'efs-mount-target');
  }

  async handle(_diff: Diff<EfsMountTarget>): Promise<void> {}

  async mock(
    _diff: Diff<EfsMountTarget>,
    capture: Partial<EfsMountTargetSchema['response']>,
  ): Promise<EfsMountTargetSchema['response']> {
    return {
      MountTargetId: capture.MountTargetId,
      NetworkInterfaceId: capture.NetworkInterfaceId,
    };
  }
}

@Factory<CaptureEfsMountTargetResponseResourceAction>(CaptureEfsMountTargetResponseResourceAction)
export class CaptureEfsMountTargetResponseResourceActionFactory {
  private static instance: CaptureEfsMountTargetResponseResourceAction;

  static async create(): Promise<CaptureEfsMountTargetResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureEfsMountTargetResponseResourceAction();
    }
    return this.instance;
  }
}
