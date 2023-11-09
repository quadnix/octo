import { DeleteSubnetCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { ISubnetProperties, ISubnetResponse } from '../subnet.interface.js';
import { Subnet } from '../subnet.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteSubnetAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteSubnetAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'subnet';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const subnet = diff.model as Subnet;
    const properties = subnet.properties as unknown as ISubnetProperties;
    const response = subnet.response as unknown as ISubnetResponse;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    // Delete Subnet.
    await ec2Client.send(
      new DeleteSubnetCommand({
        SubnetId: response.SubnetId,
      }),
    );
  }
}

@Factory<DeleteSubnetAction>(DeleteSubnetAction)
export class DeleteSubnetActionFactory {
  static async create(): Promise<DeleteSubnetAction> {
    return new DeleteSubnetAction();
  }
}
