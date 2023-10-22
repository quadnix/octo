import { DeleteSubnetCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { ISubnetResponse } from '../subnet.interface.js';
import { Subnet } from '../subnet.resource.js';

export class DeleteSubnetAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteSubnetAction';

  constructor(private readonly ec2Client: EC2Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'subnet';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const subnet = diff.model as Subnet;
    const response = subnet.response as unknown as ISubnetResponse;

    // Delete Subnet.
    await this.ec2Client.send(
      new DeleteSubnetCommand({
        SubnetId: response.SubnetId,
      }),
    );
  }
}
