import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { InternetGatewaySchema } from '../index.schema.js';
import { InternetGateway } from '../internet-gateway.resource.js';

/**
 * @internal
 */
@Action(InternetGateway)
export class CaptureInternetGatewayResponseResourceAction implements IResourceAction<InternetGateway> {
  filter(diff: Diff): boolean {
    return diff.node instanceof InternetGateway && hasNodeName(diff.node, 'internet-gateway');
  }

  async handle(_diff: Diff<InternetGateway>): Promise<void> {}

  async mock(
    _diff: Diff<InternetGateway>,
    capture: Partial<InternetGatewaySchema['response']>,
  ): Promise<InternetGatewaySchema['response']> {
    return {
      InternetGatewayArn: capture.InternetGatewayArn,
      InternetGatewayId: capture.InternetGatewayId,
    };
  }
}

@Factory<CaptureInternetGatewayResponseResourceAction>(CaptureInternetGatewayResponseResourceAction)
export class CaptureInternetGatewayResponseResourceActionFactory {
  private static instance: CaptureInternetGatewayResponseResourceAction;

  static async create(): Promise<CaptureInternetGatewayResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureInternetGatewayResponseResourceAction();
    }
    return this.instance;
  }
}
