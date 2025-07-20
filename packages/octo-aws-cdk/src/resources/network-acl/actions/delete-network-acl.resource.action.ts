import { DeleteNetworkAclCommand, EC2Client, ReplaceNetworkAclAssociationCommand } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { NetworkAcl } from '../network-acl.resource.js';

/**
 * @internal
 */
@Action(NetworkAcl)
export class DeleteNetworkAclResourceAction implements IResourceAction<NetworkAcl> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof NetworkAcl &&
      hasNodeName(diff.node, 'network-acl') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<NetworkAcl>): Promise<void> {
    // Get properties.
    const networkAcl = diff.node;
    const properties = networkAcl.properties;
    const response = networkAcl.response;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

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

  async mock(diff: Diff<NetworkAcl>): Promise<void> {
    // Get properties.
    const networkAcl = diff.node;
    const properties = networkAcl.properties;

    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof ReplaceNetworkAclAssociationCommand) {
        return;
      } else if (instance instanceof DeleteNetworkAclCommand) {
        return;
      }
    };
  }
}

/**
 * @internal
 */
@Factory<DeleteNetworkAclResourceAction>(DeleteNetworkAclResourceAction)
export class DeleteNetworkAclResourceActionFactory {
  private static instance: DeleteNetworkAclResourceAction;

  static async create(): Promise<DeleteNetworkAclResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteNetworkAclResourceAction(container);
    }
    return this.instance;
  }
}
