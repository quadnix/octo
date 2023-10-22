import { DeleteNetworkAclCommand, EC2Client, ReplaceNetworkAclAssociationCommand } from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { INetworkAclResponse } from '../network-acl.interface.js';
import { NetworkAcl } from '../network-acl.resource.js';

export class DeleteNetworkAclAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteNetworkAclAction';

  constructor(private readonly ec2Client: EC2Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'network-acl';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const networkAcl = diff.model as NetworkAcl;
    const response = networkAcl.response as unknown as INetworkAclResponse;

    // Associate Subnet with the default Network ACL.
    await this.ec2Client.send(
      new ReplaceNetworkAclAssociationCommand({
        AssociationId: response.associationId,
        NetworkAclId: response.defaultNetworkAclId,
      }),
    );

    // Delete Network ACL.
    await this.ec2Client.send(
      new DeleteNetworkAclCommand({
        NetworkAclId: response.NetworkAclId,
      }),
    );
  }
}
