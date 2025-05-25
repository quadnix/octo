import { CreateSubnetCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { Subnet } from '../subnet.resource.js';
import type { SubnetSchema } from '../subnet.schema.js';

@Action(Subnet)
export class AddSubnetResourceAction implements IResourceAction<Subnet> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof Subnet &&
      (diff.node.constructor as typeof Subnet).NODE_NAME === 'subnet' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const subnet = diff.node as Subnet;
    const properties = subnet.properties;
    const response = subnet.response;
    const subnetVpc = subnet.parents[0];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create Subnet.
    const subnetOutput = await ec2Client.send(
      new CreateSubnetCommand({
        AvailabilityZone: properties.AvailabilityZone,
        CidrBlock: properties.CidrBlock,
        VpcId: subnetVpc.getSchemaInstance().response.VpcId,
      }),
    );

    // Set response.
    response.SubnetId = subnetOutput.Subnet!.SubnetId!;
  }

  async mock(diff: Diff, capture: Partial<SubnetSchema['response']>): Promise<void> {
    // Get properties.
    const subnet = diff.node as Subnet;
    const properties = subnet.properties;

    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateSubnetCommand) {
        return { Subnet: { SubnetId: capture.SubnetId } };
      }
    };
  }
}

@Factory<AddSubnetResourceAction>(AddSubnetResourceAction)
export class AddSubnetResourceActionFactory {
  private static instance: AddSubnetResourceAction;

  static async create(): Promise<AddSubnetResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddSubnetResourceAction(container);
    }
    return this.instance;
  }
}
