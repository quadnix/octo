import { DeleteSecurityGroupCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { ISecurityGroupResponse } from '../security-group.interface';
import { SecurityGroup } from '../security-group.resource';

export class DeleteSecurityGroupAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteSecurityGroupAction';

  constructor(private readonly ec2Client: EC2Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'security-group';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const securityGroup = diff.model as SecurityGroup;
    const response = securityGroup.response as unknown as ISecurityGroupResponse;

    // Delete Security Group.
    await this.ec2Client.send(
      new DeleteSecurityGroupCommand({
        GroupId: response.GroupId,
      }),
    );
  }
}
