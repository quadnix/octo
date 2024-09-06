import { CreateVpcCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import type { IVpcResponse } from '../vpc.interface.js';
import { Vpc } from '../vpc.resource.js';

@Action(NodeType.RESOURCE)
export class AddVpcResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddVpcResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.node instanceof Vpc && diff.node.NODE_NAME === 'vpc';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const vpc = diff.node as Vpc;
    const properties = vpc.properties;
    const response = vpc.response;

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
    response.VpcId = vpcOutput.Vpc!.VpcId!;
  }

  async mock(capture: Partial<IVpcResponse>): Promise<void> {
    const ec2Client = await Container.get(EC2Client, { args: ['mock'] });
    ec2Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreateVpcCommand) {
        return { Vpc: { VpcId: capture.VpcId } };
      }
    };
  }
}

@Factory<AddVpcResourceAction>(AddVpcResourceAction)
export class AddVpcResourceActionFactory {
  static async create(): Promise<AddVpcResourceAction> {
    return new AddVpcResourceAction();
  }
}
