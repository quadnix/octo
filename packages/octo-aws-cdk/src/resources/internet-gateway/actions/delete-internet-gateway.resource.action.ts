import { DeleteInternetGatewayCommand, DetachInternetGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import type { Vpc } from '../../vpc/vpc.resource.js';
import { InternetGateway } from '../internet-gateway.resource.js';

@Action(NodeType.RESOURCE)
export class DeleteInternetGatewayResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteInternetGatewayResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof InternetGateway &&
      diff.node.NODE_NAME === 'internet-gateway'
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
