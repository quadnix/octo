import { DeleteSubnetCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import { Subnet } from '../subnet.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteSubnetResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteSubnetResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model instanceof Subnet && diff.model.MODEL_NAME === 'subnet';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const subnet = diff.model as Subnet;
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
    const ec2Client = await Container.get(EC2Client);
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
