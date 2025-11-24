import { DescribeSubnetsCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { Subnet } from '../subnet.resource.js';

/**
 * @internal
 */
@Action(Subnet)
export class ValidateSubnetResourceAction extends ANodeAction implements IResourceAction<Subnet> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof Subnet &&
      hasNodeName(diff.node, 'subnet') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<Subnet>): Promise<void> {
    // Get properties.
    const subnet = diff.node;
    const properties = subnet.properties;
    const response = subnet.response;
    const subnetVpc = subnet.parents[0];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if Subnet exists.
    const describeSubnetsResult = await ec2Client.send(
      new DescribeSubnetsCommand({
        SubnetIds: [response.SubnetId!],
      }),
    );
    if (!describeSubnetsResult.Subnets || describeSubnetsResult.Subnets.length === 0) {
      throw new TransactionError(`Subnet with ID ${response.SubnetId} does not exist!`);
    }

    // Validate Subnet CIDR block.
    const actualSubnet = describeSubnetsResult.Subnets[0];
    if (actualSubnet.CidrBlock !== properties.CidrBlock) {
      throw new TransactionError(
        `Subnet CIDR block mismatch. Expected: ${properties.CidrBlock}, Actual: ${actualSubnet.CidrBlock || 'undefined'}`,
      );
    }

    // Validate Subnet availability zone.
    if (actualSubnet.AvailabilityZone !== properties.AvailabilityZone) {
      throw new TransactionError(
        `Subnet availability zone mismatch. Expected: ${properties.AvailabilityZone}, Actual: ${actualSubnet.AvailabilityZone || 'undefined'}`,
      );
    }

    // Validate Subnet VPC (parent).
    const expectedVpcId = subnetVpc.getSchemaInstanceInResourceAction().response.VpcId;
    if (actualSubnet.VpcId !== expectedVpcId) {
      throw new TransactionError(
        `Subnet VPC mismatch. Expected: ${expectedVpcId}, Actual: ${actualSubnet.VpcId || 'undefined'}`,
      );
    }

    // Validate Subnet owner (AWS account).
    if (actualSubnet.OwnerId !== properties.awsAccountId) {
      throw new TransactionError(
        `Subnet account ID mismatch. Expected: ${properties.awsAccountId}, Actual: ${actualSubnet.OwnerId || 'undefined'}`,
      );
    }

    // Validate Subnet ARN format (region should match).
    const expectedArnPrefix = `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:subnet/`;
    if (!response.SubnetArn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `Subnet ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.SubnetArn}`,
      );
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateSubnetResourceAction>(ValidateSubnetResourceAction)
export class ValidateSubnetResourceActionFactory {
  private static instance: ValidateSubnetResourceAction;

  static async create(): Promise<ValidateSubnetResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateSubnetResourceAction();
    }
    return this.instance;
  }
}

