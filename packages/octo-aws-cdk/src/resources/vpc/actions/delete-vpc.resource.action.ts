import { DeleteVpcCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import { Vpc } from '../vpc.resource.js';

@Action(NodeType.RESOURCE)
export class DeleteVpcResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteVpcResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.node instanceof Vpc && diff.node.NODE_NAME === 'vpc';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const vpc = diff.node as Vpc;
    const properties = vpc.properties;
    const response = vpc.response;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    // Delete VPC.
    await ec2Client.send(
      new DeleteVpcCommand({
        VpcId: response.VpcId,
      }),
    );
  }

  async mock(): Promise<void> {
    const ec2Client = await Container.get(EC2Client, { args: ['mock'] });
    ec2Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof DeleteVpcCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteVpcResourceAction>(DeleteVpcResourceAction)
export class DeleteVpcResourceActionFactory {
  static async create(): Promise<DeleteVpcResourceAction> {
    return new DeleteVpcResourceAction();
  }
}
