import { DeleteSubnetCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import { Subnet } from '../subnet.resource.js';

@Action(NodeType.RESOURCE)
export class DeleteSubnetResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteSubnetResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.node instanceof Subnet && diff.node.NODE_NAME === 'subnet';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const subnet = diff.node as Subnet;
    const properties = subnet.properties;
    const response = subnet.response;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    // Delete Subnet.
    await ec2Client.send(
      new DeleteSubnetCommand({
        SubnetId: response.SubnetId,
      }),
    );
  }

  async mock(): Promise<void> {
    const ec2Client = await Container.get(EC2Client, { args: ['mock'] });
    ec2Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof DeleteSubnetCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteSubnetResourceAction>(DeleteSubnetResourceAction)
export class DeleteSubnetResourceActionFactory {
  static async create(): Promise<DeleteSubnetResourceAction> {
    return new DeleteSubnetResourceAction();
  }
}
