import { DeleteNetworkAclCommand, EC2Client, ReplaceNetworkAclAssociationCommand } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { INetworkAclProperties, INetworkAclResponse } from '../network-acl.interface.js';
import type { NetworkAcl } from '../network-acl.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteNetworkAclResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteNetworkAclResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'network-acl';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const networkAcl = diff.model as NetworkAcl;
    const properties = networkAcl.properties as unknown as INetworkAclProperties;
    const response = networkAcl.response as unknown as INetworkAclResponse;

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
}

@Factory<DeleteNetworkAclResourceAction>(DeleteNetworkAclResourceAction)
export class DeleteNetworkAclResourceActionFactory {
  static async create(): Promise<DeleteNetworkAclResourceAction> {
    return new DeleteNetworkAclResourceAction();
  }
}
