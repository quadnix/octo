import { CreateVpcCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { IVpcProperties, IVpcResponse } from '../vpc.interface.js';
import { Vpc } from '../vpc.resource.js';

@Action(ModelType.RESOURCE)
export class AddVpcResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddVpcResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model instanceof Vpc && diff.model.MODEL_NAME === 'vpc';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const vpc = diff.model as Vpc;
    const properties = vpc.properties as unknown as IVpcProperties;
    const response = vpc.response as unknown as IVpcResponse;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    // Create VPC.
    const vpcOutput = await ec2Client.send(
      new CreateVpcCommand({
        CidrBlock: properties.CidrBlock,
        InstanceTenancy: properties.InstanceTenancy,
      }),
    );

    // Set response.
    response.VpcId = vpcOutput.Vpc!.VpcId as string;
  }
}

@Factory<AddVpcResourceAction>(AddVpcResourceAction)
export class AddVpcResourceActionFactory {
  static async create(): Promise<AddVpcResourceAction> {
    return new AddVpcResourceAction();
  }
}
