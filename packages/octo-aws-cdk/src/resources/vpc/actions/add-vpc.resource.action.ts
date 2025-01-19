import { CreateVpcCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { Vpc } from '../vpc.resource.js';
import type { VpcSchema } from '../vpc.schema.js';

@Action(Vpc)
export class AddVpcResourceAction implements IResourceAction<Vpc> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof Vpc &&
      (diff.node.constructor as typeof Vpc).NODE_NAME === 'vpc' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const vpc = diff.node as Vpc;
    const properties = vpc.properties;
    const response = vpc.response;

    // Get instances.
    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

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

  async mock(diff: Diff, capture: Partial<VpcSchema['response']>): Promise<void> {
    // Get properties.
    const vpc = diff.node as Vpc;
    const properties = vpc.properties;

    const ec2Client = await this.container.get(EC2Client, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateVpcCommand) {
        return { Vpc: { VpcId: capture.VpcId } };
      }
    };
  }
}

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
