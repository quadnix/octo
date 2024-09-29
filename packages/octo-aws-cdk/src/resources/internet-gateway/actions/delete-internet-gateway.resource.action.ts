import { DeleteInternetGatewayCommand, DetachInternetGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { Vpc } from '../../vpc/index.js';
import { InternetGateway } from '../internet-gateway.resource.js';

@Action(InternetGateway)
export class DeleteInternetGatewayResourceAction implements IResourceAction {
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
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

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

  async mock(): Promise<void> {
    const ec2Client = await Container.get(EC2Client, { args: ['mock'] });
    ec2Client.send = async (instance): Promise<unknown> => {
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
    return new DeleteInternetGatewayResourceAction();
  }
}
