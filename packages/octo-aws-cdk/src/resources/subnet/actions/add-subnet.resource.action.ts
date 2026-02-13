import { CreateSubnetCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { SubnetSchema } from '../index.schema.js';
import { Subnet } from '../subnet.resource.js';

/**
 * @internal
 */
@Action(Subnet)
export class AddSubnetResourceAction implements IResourceAction<Subnet> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof Subnet &&
      hasNodeName(diff.node, 'subnet') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<Subnet>): Promise<SubnetSchema['response']> {
    // Get properties.
    const subnet = diff.node;
    const properties = subnet.properties;
    const tags = subnet.tags;
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
        TagSpecifications:
          Object.keys(tags).length > 0
            ? [
                {
                  ResourceType: 'subnet',
                  Tags: Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })),
                },
              ]
            : undefined,
        VpcId: subnetVpc.getSchemaInstanceInResourceAction().response.VpcId,
      }),
    );

    const subnetId = subnetOutput.Subnet!.SubnetId!;
    return {
      SubnetArn: `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:subnet/${subnetId}`,
      SubnetId: subnetId,
    };
  }

  async mock(diff: Diff<Subnet>, capture: Partial<SubnetSchema['response']>): Promise<SubnetSchema['response']> {
    // Get properties.
    const subnet = diff.node;
    const properties = subnet.properties;

    return {
      SubnetArn: `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:subnet/${capture.SubnetId}`,
      SubnetId: capture.SubnetId!,
    };
  }
}

/**
 * @internal
 */
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
