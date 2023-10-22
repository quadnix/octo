import { DeleteInternetGatewayCommand, DetachInternetGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IVpcResponse } from '../../vpc/vpc.interface.js';
import { Vpc } from '../../vpc/vpc.resource.js';
import { IInternetGatewayResponse } from '../internet-gateway.interface.js';
import { InternetGateway } from '../internet-gateway.resource.js';

export class DeleteInternetGatewayAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteInternetGatewayAction';

  constructor(private readonly ec2Client: EC2Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'internet-gateway';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const internetGateway = diff.model as InternetGateway;
    const response = internetGateway.response as unknown as IInternetGatewayResponse;

    const vpc = internetGateway.getParents('vpc')['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response as unknown as IVpcResponse;

    // Detach from VPC.
    await this.ec2Client.send(
      new DetachInternetGatewayCommand({
        InternetGatewayId: response.InternetGatewayId,
        VpcId: vpcResponse.VpcId,
      }),
    );

    // Create Internet Gateway.
    await this.ec2Client.send(
      new DeleteInternetGatewayCommand({
        InternetGatewayId: response.InternetGatewayId,
      }),
    );
  }
}
