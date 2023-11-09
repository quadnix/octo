import { CreateVpcCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IVpcProperties, IVpcResponse } from '../vpc.interface.js';
import { Vpc } from '../vpc.resource.js';

@Action(ModelType.RESOURCE)
export class AddVpcAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddVpcAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'vpc';
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

@Factory<AddVpcAction>(AddVpcAction)
export class AddVpcActionFactory {
  static async create(): Promise<AddVpcAction> {
    return new AddVpcAction();
  }
}
