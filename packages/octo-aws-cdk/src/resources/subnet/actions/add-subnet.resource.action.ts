import { CreateSubnetCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import { Subnet } from '../subnet.resource.js';
import type { Vpc } from '../../vpc/vpc.resource.js';

@Action(ModelType.RESOURCE)
export class AddSubnetResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddSubnetResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model instanceof Subnet && diff.model.MODEL_NAME === 'subnet';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const subnet = diff.model as Subnet;
    const properties = subnet.properties;
    const response = subnet.response;
    const vpc = subnet.getParents('vpc')['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    // Create Subnet.
    const subnetOutput = await ec2Client.send(
      new CreateSubnetCommand({
        AvailabilityZone: properties.AvailabilityZone,
        CidrBlock: properties.CidrBlock,
        VpcId: vpcResponse.VpcId,
      }),
    );

    // Set response.
    response.SubnetId = subnetOutput.Subnet!.SubnetId!;
  }
}

@Factory<AddSubnetResourceAction>(AddSubnetResourceAction)
export class AddSubnetResourceActionFactory {
  static async create(): Promise<AddSubnetResourceAction> {
    return new AddSubnetResourceAction();
  }
}
