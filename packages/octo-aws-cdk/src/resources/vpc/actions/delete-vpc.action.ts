import { DeleteVpcCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IVpcProperties, IVpcResponse } from '../vpc.interface.js';
import { Vpc } from '../vpc.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteVpcAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteVpcAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'vpc';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const vpc = diff.model as Vpc;
    const properties = vpc.properties as unknown as IVpcProperties;
    const response = vpc.response as unknown as IVpcResponse;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    // Delete VPC.
    await ec2Client.send(
      new DeleteVpcCommand({
        VpcId: response.VpcId,
      }),
    );
  }
}

@Factory<DeleteVpcAction>(DeleteVpcAction)
export class DeleteVpcActionFactory {
  static async create(): Promise<DeleteVpcAction> {
    return new DeleteVpcAction();
  }
}
