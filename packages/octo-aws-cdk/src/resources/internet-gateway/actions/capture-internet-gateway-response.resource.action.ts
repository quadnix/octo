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
    diff: Diff<InternetGateway>,
    capture: Partial<InternetGatewaySchema['response']>,
  ): Promise<InternetGatewaySchema['response']> {
    // Get properties.
    const internetGateway = diff.node;
    const properties = internetGateway.properties;

    return {
      InternetGatewayArn: `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:internet-gateway/${capture.InternetGatewayId}`,
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
