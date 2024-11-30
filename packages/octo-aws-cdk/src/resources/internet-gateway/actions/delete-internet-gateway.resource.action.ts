import { DeleteInternetGatewayCommand, DetachInternetGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { Vpc } from '../../vpc/index.js';
import { InternetGateway } from '../internet-gateway.resource.js';

@Action(InternetGateway)
export class DeleteInternetGatewayResourceAction implements IResourceAction<InternetGateway> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof InternetGateway &&
      (diff.node.constructor as typeof InternetGateway).NODE_NAME === 'internet-gateway'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const internetGateway = diff.node as InternetGateway;
    const properties = internetGateway.properties;
    const response = internetGateway.response;

    // Get instances.
    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

    const vpc = internetGateway.getParents('vpc')['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response;

    // Detach from VPC.
    await ec2Client.send(
      new DetachInternetGatewayCommand({
        InternetGatewayId: response.InternetGatewayId,
        VpcId: vpcResponse.VpcId,
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
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
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
  static async create(): Promise<DeleteInternetGatewayResourceAction> {
    const container = Container.getInstance();
    return new DeleteInternetGatewayResourceAction(container);
  }
}
