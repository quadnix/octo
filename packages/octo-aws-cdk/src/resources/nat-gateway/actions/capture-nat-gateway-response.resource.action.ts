import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { NatGatewaySchema } from '../index.schema.js';
import { NatGateway } from '../nat-gateway.resource.js';

/**
 * @internal
 */
@Action(NatGateway)
export class CaptureNatGatewayResponseResourceAction implements IResourceAction<NatGateway> {
  filter(diff: Diff): boolean {
    return diff.node instanceof NatGateway && hasNodeName(diff.node, 'nat-gateway');
  }

  async handle(_diff: Diff<NatGateway>): Promise<void> {}

  async mock(
    _diff: Diff<NatGateway>,
    capture: Partial<NatGatewaySchema['response']>,
  ): Promise<NatGatewaySchema['response']> {
    return {
      AllocationId: capture.AllocationId,
      NatGatewayId: capture.NatGatewayId,
    };
  }
}

@Factory<CaptureNatGatewayResponseResourceAction>(CaptureNatGatewayResponseResourceAction)
export class CaptureNatGatewayResponseResourceActionFactory {
  private static instance: CaptureNatGatewayResponseResourceAction;

  static async create(): Promise<CaptureNatGatewayResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureNatGatewayResponseResourceAction();
    }
    return this.instance;
  }
}
