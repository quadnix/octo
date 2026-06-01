import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { VpcSchema } from '../index.schema.js';
import { Vpc } from '../vpc.resource.js';

/**
 * @internal
 */
@Action(Vpc)
export class CaptureVpcResponseResourceAction implements IResourceAction<Vpc> {
  filter(diff: Diff): boolean {
    return diff.node instanceof Vpc && hasNodeName(diff.node, 'vpc');
  }

  async handle(_diff: Diff<Vpc>): Promise<void> {}

  async mock(_diff: Diff<Vpc>, capture: Partial<VpcSchema['response']>): Promise<VpcSchema['response']> {
    return {
      VpcArn: capture.VpcArn,
      VpcId: capture.VpcId,
    };
  }
}

@Factory<CaptureVpcResponseResourceAction>(CaptureVpcResponseResourceAction)
export class CaptureVpcResponseResourceActionFactory {
  private static instance: CaptureVpcResponseResourceAction;

  static async create(): Promise<CaptureVpcResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureVpcResponseResourceAction();
    }
    return this.instance;
  }
}
