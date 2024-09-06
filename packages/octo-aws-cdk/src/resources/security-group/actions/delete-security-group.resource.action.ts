import { DeleteSecurityGroupCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import { SecurityGroup } from '../security-group.resource.js';

@Action(NodeType.RESOURCE)
export class DeleteSecurityGroupResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteSecurityGroupResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof SecurityGroup &&
      diff.node.NODE_NAME === 'security-group'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const securityGroup = diff.node as SecurityGroup;
    const properties = securityGroup.properties!;
    const response = securityGroup.response!;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    // Delete Security Group.
    await ec2Client.send(
      new DeleteSecurityGroupCommand({
        GroupId: response.GroupId,
      }),
    );
  }

  async mock(): Promise<void> {
    const ec2Client = await Container.get(EC2Client, { args: ['mock'] });
    ec2Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof DeleteSecurityGroupCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteSecurityGroupResourceAction>(DeleteSecurityGroupResourceAction)
export class DeleteSecurityGroupResourceActionFactory {
  static async create(): Promise<DeleteSecurityGroupResourceAction> {
    return new DeleteSecurityGroupResourceAction();
  }
}
