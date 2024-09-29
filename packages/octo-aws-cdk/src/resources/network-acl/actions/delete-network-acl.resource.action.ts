import { DeleteNetworkAclCommand, EC2Client, ReplaceNetworkAclAssociationCommand } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { NetworkAcl } from '../network-acl.resource.js';

@Action(NetworkAcl)
export class DeleteNetworkAclResourceAction implements IResourceAction {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof NetworkAcl &&
      (diff.node.constructor as typeof NetworkAcl).NODE_NAME === 'network-acl'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const networkAcl = diff.node as NetworkAcl;
    const properties = networkAcl.properties;
    const response = networkAcl.response;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    // Associate Subnet with the default Network ACL.
    await ec2Client.send(
      new ReplaceNetworkAclAssociationCommand({
        AssociationId: response.associationId,
        NetworkAclId: response.defaultNetworkAclId,
      }),
    );

    // Delete Network ACL.
    await ec2Client.send(
      new DeleteNetworkAclCommand({
        NetworkAclId: response.NetworkAclId,
      }),
    );
  }

  async mock(): Promise<void> {
    const ec2Client = await Container.get(EC2Client, { args: ['mock'] });
    ec2Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof ReplaceNetworkAclAssociationCommand) {
        return;
      } else if (instance instanceof DeleteNetworkAclCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteNetworkAclResourceAction>(DeleteNetworkAclResourceAction)
export class DeleteNetworkAclResourceActionFactory {
  static async create(): Promise<DeleteNetworkAclResourceAction> {
    return new DeleteNetworkAclResourceAction();
  }
}
