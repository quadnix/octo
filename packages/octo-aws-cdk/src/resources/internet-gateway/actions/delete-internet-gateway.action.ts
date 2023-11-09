import { DeleteInternetGatewayCommand, DetachInternetGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IVpcResponse } from '../../vpc/vpc.interface.js';
import { Vpc } from '../../vpc/vpc.resource.js';
import { IInternetGatewayProperties, IInternetGatewayResponse } from '../internet-gateway.interface.js';
import { InternetGateway } from '../internet-gateway.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteInternetGatewayAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteInternetGatewayAction';

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

@Factory<DeleteInternetGatewayAction>(DeleteInternetGatewayAction)
export class DeleteInternetGatewayActionFactory {
  static async create(): Promise<DeleteInternetGatewayAction> {
    return new DeleteInternetGatewayAction();
  }
}
