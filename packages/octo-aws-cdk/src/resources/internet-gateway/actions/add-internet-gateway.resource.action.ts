import { AttachInternetGatewayCommand, CreateInternetGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { IVpcResponse } from '../../vpc/vpc.interface.js';
import type { Vpc } from '../../vpc/vpc.resource.js';
import type { IInternetGatewayProperties, IInternetGatewayResponse } from '../internet-gateway.interface.js';
import { InternetGateway } from '../internet-gateway.resource.js';

@Action(ModelType.RESOURCE)
export class AddInternetGatewayResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddInternetGatewayResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof InternetGateway &&
      diff.model.MODEL_NAME === 'internet-gateway'
    );
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
    response.InternetGatewayId = internetGWOutput!.InternetGateway!.InternetGatewayId as string;
  }
}

@Factory<AddInternetGatewayResourceAction>(AddInternetGatewayResourceAction)
export class AddInternetGatewayResourceActionFactory {
  static async create(): Promise<AddInternetGatewayResourceAction> {
    return new AddInternetGatewayResourceAction();
  }
}
