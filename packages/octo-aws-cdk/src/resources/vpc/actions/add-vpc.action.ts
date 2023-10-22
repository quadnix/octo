import { CreateVpcCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IVpcProperties, IVpcResponse } from '../vpc.interface.js';
import { Vpc } from '../vpc.resource.js';

export class AddVpcAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddVpcAction';

  constructor(private readonly ec2Client: EC2Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'vpc';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const vpc = diff.model as Vpc;
    const properties = vpc.properties as unknown as IVpcProperties;
    const response = vpc.response as unknown as IVpcResponse;

    // Create VPC.
    const vpcOutput = await this.ec2Client.send(
      new CreateVpcCommand({
        CidrBlock: properties.CidrBlock,
        InstanceTenancy: properties.InstanceTenancy,
      }),
    );

    // Set response.
    response.VpcId = vpcOutput.Vpc!.VpcId as string;
  }
}
