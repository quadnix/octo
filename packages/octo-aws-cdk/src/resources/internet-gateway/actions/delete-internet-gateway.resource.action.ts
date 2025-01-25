import { DeleteInternetGatewayCommand, DetachInternetGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { InternetGateway } from '../internet-gateway.resource.js';

@Action(InternetGateway)
export class DeleteInternetGatewayResourceAction implements IResourceAction<InternetGateway> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
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
    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsAccountId: properties.awsAccountId, awsRegionId: properties.awsRegionId, package: '@octo' },
    });

    // Detach from VPC.
    await ec2Client.send(
      new DetachInternetGatewayCommand({
        InternetGatewayId: response.InternetGatewayId,
        VpcId: internetGatewayVpc.getSchemaInstance().response.VpcId,
      }),
    );

    // Create Internet Gateway.
    await ec2Client.send(
      new DeleteInternetGatewayCommand({
        InternetGatewayId: response.InternetGatewayId,
      }),
    );
  }

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const internetGateway = diff.node as InternetGateway;
    const properties = internetGateway.properties;

    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsAccountId: properties.awsAccountId, awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DetachInternetGatewayCommand) {
        return;
      } else if (instance instanceof DeleteInternetGatewayCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteInternetGatewayResourceAction>(DeleteInternetGatewayResourceAction)
export class DeleteInternetGatewayResourceActionFactory {
  private static instance: DeleteInternetGatewayResourceAction;

  static async create(): Promise<DeleteInternetGatewayResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteInternetGatewayResourceAction(container);
    }
    return this.instance;
  }
}
