import { DeleteVpcCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { IVpcProperties, IVpcResponse } from '../vpc.interface.js';
import { Vpc } from '../vpc.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteVpcResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteVpcResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model instanceof Vpc && diff.model.MODEL_NAME === 'vpc';
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

@Factory<DeleteVpcResourceAction>(DeleteVpcResourceAction)
export class DeleteVpcResourceActionFactory {
  static async create(): Promise<DeleteVpcResourceAction> {
    return new DeleteVpcResourceAction();
  }
}
