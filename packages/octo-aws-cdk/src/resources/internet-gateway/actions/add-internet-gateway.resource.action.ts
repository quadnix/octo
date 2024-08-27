import { AttachInternetGatewayCommand, CreateInternetGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import type { Vpc } from '../../vpc/vpc.resource.js';
import type { IInternetGatewayResponse } from '../internet-gateway.interface.js';
import { InternetGateway } from '../internet-gateway.resource.js';

@Action(NodeType.RESOURCE)
export class AddInternetGatewayResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddInternetGatewayResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
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

    // Create Internet Gateway.
    const internetGWOutput = await ec2Client.send(new CreateInternetGatewayCommand({}));

    // Attach to VPC.
    await ec2Client.send(
      new AttachInternetGatewayCommand({
        InternetGatewayId: internetGWOutput!.InternetGateway!.InternetGatewayId,
        VpcId: vpcResponse.VpcId,
      }),
    );

    // Set response.
    response.InternetGatewayId = internetGWOutput!.InternetGateway!.InternetGatewayId!;
  }

  async mock(capture: Partial<IInternetGatewayResponse>): Promise<void> {
    const ec2Client = await Container.get(EC2Client);
    ec2Client.send = async (instance): Promise<unknown> => {
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
  static async create(): Promise<AddInternetGatewayResourceAction> {
    return new AddInternetGatewayResourceAction();
  }
}
