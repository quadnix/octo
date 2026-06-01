import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { SubnetSchema } from '../index.schema.js';
import { Subnet } from '../subnet.resource.js';

/**
 * @internal
 */
@Action(Subnet)
export class CaptureSubnetResponseResourceAction implements IResourceAction<Subnet> {
  filter(diff: Diff): boolean {
    return diff.node instanceof Subnet && hasNodeName(diff.node, 'subnet');
  }

  async handle(_diff: Diff<Subnet>): Promise<void> {}

  async mock(_diff: Diff<Subnet>, capture: Partial<SubnetSchema['response']>): Promise<SubnetSchema['response']> {
    return {
      SubnetArn: capture.SubnetArn,
      SubnetId: capture.SubnetId,
    };
  }
}

@Factory<CaptureSubnetResponseResourceAction>(CaptureSubnetResponseResourceAction)
export class CaptureSubnetResponseResourceActionFactory {
  private static instance: CaptureSubnetResponseResourceAction;

  static async create(): Promise<CaptureSubnetResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureSubnetResponseResourceAction();
    }
    return this.instance;
  }
}
