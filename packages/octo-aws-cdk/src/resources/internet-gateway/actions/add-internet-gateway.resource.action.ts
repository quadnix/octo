import { AttachInternetGatewayCommand, CreateInternetGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { ECSClientFactory } from '../../../factories/aws-client.factory.js';
import { InternetGateway } from '../internet-gateway.resource.js';
import type { InternetGatewaySchema } from '../internet-gateway.schema.js';

@Action(InternetGateway)
export class AddInternetGatewayResourceAction implements IResourceAction<InternetGateway> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof InternetGateway &&
      (diff.node.constructor as typeof InternetGateway).NODE_NAME === 'internet-gateway' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const internetGateway = diff.node as InternetGateway;
    const properties = internetGateway.properties;
    const response = internetGateway.response;
    const internetGatewayVpc = internetGateway.parents[0];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof ECSClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create Internet Gateway.
    const internetGWOutput = await ec2Client.send(new CreateInternetGatewayCommand({}));

    // Attach to VPC.
    await ec2Client.send(
      new AttachInternetGatewayCommand({
        InternetGatewayId: internetGWOutput!.InternetGateway!.InternetGatewayId,
        VpcId: internetGatewayVpc.getSchemaInstance().response.VpcId,
      }),
    );

    // Set response.
    response.InternetGatewayId = internetGWOutput!.InternetGateway!.InternetGatewayId!;
  }

  async mock(diff: Diff, capture: Partial<InternetGatewaySchema['response']>): Promise<void> {
    // Get properties.
    const internetGateway = diff.node as InternetGateway;
    const properties = internetGateway.properties;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof ECSClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateInternetGatewayCommand) {
        return { InternetGateway: { InternetGatewayId: capture.InternetGatewayId } };
      } else if (instance instanceof AttachInternetGatewayCommand) {
        return;
      }
    };
  }
}

@Factory<AddInternetGatewayResourceAction>(AddInternetGatewayResourceAction)
export class AddInternetGatewayResourceActionFactory {
  private static instance: AddInternetGatewayResourceAction;

  static async create(): Promise<AddInternetGatewayResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddInternetGatewayResourceAction(container);
    }
    return this.instance;
  }
}
