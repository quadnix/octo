import { CreateSubnetCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { ISubnetProperties, ISubnetResponse } from '../subnet.interface.js';
import { Subnet } from '../subnet.resource.js';
import { IVpcResponse } from '../../vpc/vpc.interface.js';
import { Vpc } from '../../vpc/vpc.resource.js';

export class AddSubnetAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddSubnetAction';

  constructor(private readonly ec2Client: EC2Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'subnet';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const subnet = diff.model as Subnet;
    const properties = subnet.properties as unknown as ISubnetProperties;
    const response = subnet.response as unknown as ISubnetResponse;
    const vpc = subnet.getParents('vpc')['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response as unknown as IVpcResponse;

    // Create Subnet.
    const subnetOutput = await this.ec2Client.send(
      new CreateSubnetCommand({
        AvailabilityZone: properties.AvailabilityZone,
        CidrBlock: properties.CidrBlock,
        VpcId: vpcResponse.VpcId,
      }),
    );

    // Set response.
    response.SubnetId = subnetOutput.Subnet!.SubnetId as string;
  }
}
