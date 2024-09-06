import { CreateSubnetCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import type { ISubnetResponse } from '../subnet.interface.js';
import { Subnet } from '../subnet.resource.js';
import type { Vpc } from '../../vpc/vpc.resource.js';

@Action(NodeType.RESOURCE)
export class AddSubnetResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddSubnetResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.node instanceof Subnet && diff.node.NODE_NAME === 'subnet';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const subnet = diff.node as Subnet;
    const properties = subnet.properties;
    const response = subnet.response;
    const vpc = subnet.getParents('vpc')['vpc'][0].to as Vpc;
    const vpcResponse = vpc.response;

    // Get instances.
    const ec2Client = await Container.get(EC2Client, { args: [properties.awsRegionId] });

    // Create Subnet.
    const subnetOutput = await ec2Client.send(
      new CreateSubnetCommand({
        AvailabilityZone: properties.AvailabilityZone,
        CidrBlock: properties.CidrBlock,
        VpcId: vpcResponse.VpcId,
      }),
    );

    // Set response.
    response.SubnetId = subnetOutput.Subnet!.SubnetId!;
  }

  async mock(capture: Partial<ISubnetResponse>): Promise<void> {
    const ec2Client = await Container.get(EC2Client, { args: ['mock'] });
    ec2Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreateSubnetCommand) {
        return { Subnet: { SubnetId: capture.SubnetId } };
      }
    };
  }
}

@Factory<AddSubnetResourceAction>(AddSubnetResourceAction)
export class AddSubnetResourceActionFactory {
  static async create(): Promise<AddSubnetResourceAction> {
    return new AddSubnetResourceAction();
  }
}
