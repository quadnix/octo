import { DeleteInternetGatewayCommand, DetachInternetGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import type { Diff } from '@quadnix/octo';
import type { IVpcResponse } from '../../vpc/vpc.interface.js';
import type { Vpc } from '../../vpc/vpc.resource.js';
import type { IInternetGatewayProperties, IInternetGatewayResponse } from '../internet-gateway.interface.js';
import type { InternetGateway } from '../internet-gateway.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteInternetGatewayResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteInternetGatewayResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'internet-gateway';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const internetGateway = diff.model as InternetGateway;
    const properties = internetGateway.properties as unknown as IInternetGatewayProperties;
    const response = internetGateway.response as unknown as IInternetGatewayResponse;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    const vpc = internetGateway.getParents('vpc')['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response as unknown as IVpcResponse;

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
}

@Factory<DeleteInternetGatewayResourceAction>(DeleteInternetGatewayResourceAction)
export class DeleteInternetGatewayResourceActionFactory {
  static async create(): Promise<DeleteInternetGatewayResourceAction> {
    return new DeleteInternetGatewayResourceAction();
  }
}
