import { CreateVpcCommand, EC2Client, ModifyVpcAttributeCommand } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { VpcSchema } from '../index.schema.js';
import { Vpc } from '../vpc.resource.js';

/**
 * @internal
 */
@Action(Vpc)
export class AddVpcResourceAction implements IResourceAction<Vpc> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof Vpc &&
      hasNodeName(diff.node, 'vpc') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<Vpc>): Promise<void> {
    // Get properties.
    const vpc = diff.node;
    const properties = vpc.properties;
    const response = vpc.response;
    const tags = vpc.tags;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create VPC.
    const vpcOutput = await ec2Client.send(
      new CreateVpcCommand({
        CidrBlock: properties.CidrBlock,
        InstanceTenancy: properties.InstanceTenancy,
        TagSpecifications: [
          { ResourceType: 'vpc', Tags: Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })) },
        ],
      }),
    );

    await ec2Client.send(
      new ModifyVpcAttributeCommand({
        EnableDnsHostnames: {
          Value: true,
        },
        VpcId: vpcOutput.Vpc!.VpcId!,
      }),
    );
    await ec2Client.send(
      new ModifyVpcAttributeCommand({
        EnableDnsSupport: {
          Value: true,
        },
        VpcId: vpcOutput.Vpc!.VpcId!,
      }),
    );

    // Set response.
    response.VpcArn = `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:vpc/${vpcOutput.Vpc!.VpcId}`;
    response.VpcId = vpcOutput.Vpc!.VpcId!;
  }

  async mock(diff: Diff<Vpc>, capture: Partial<VpcSchema['response']>): Promise<void> {
    // Get properties.
    const vpc = diff.node;
    const properties = vpc.properties;

    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateVpcCommand) {
        return { Vpc: { VpcId: capture.VpcId } };
      } else if (instance instanceof ModifyVpcAttributeCommand) {
        return {};
      }
    };
  }
}

/**
 * @internal
 */
@Factory<AddVpcResourceAction>(AddVpcResourceAction)
export class AddVpcResourceActionFactory {
  private static instance: AddVpcResourceAction;

  static async create(): Promise<AddVpcResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddVpcResourceAction(container);
    }
    return this.instance;
  }
}
