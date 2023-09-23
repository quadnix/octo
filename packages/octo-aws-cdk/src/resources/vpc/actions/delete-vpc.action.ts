import { DeleteVpcCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IVpcResponse } from '../vpc.interface';
import { Vpc } from '../vpc.resource';

export class DeleteVpcAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteVpcAction';

  constructor(private readonly ec2Client: EC2Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'vpc';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const vpc = diff.model as Vpc;
    const response = vpc.response as unknown as IVpcResponse;

    // Delete VPC.
    await this.ec2Client.send(
      new DeleteVpcCommand({
        VpcId: response.VpcId,
      }),
    );
  }
}
