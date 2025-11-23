import {
  DescribeVpcAttributeCommand,
  DescribeVpcsCommand,
  EC2Client,
  type VpcAttributeName,
} from '@aws-sdk/client-ec2';
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
import { Vpc } from '../vpc.resource.js';

/**
 * @internal
 */
@Action(Vpc)
export class ValidateVpcResourceAction extends ANodeAction implements IResourceAction<Vpc> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
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

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if VPC exists.
    const describeVpcsResult = await ec2Client.send(
      new DescribeVpcsCommand({
        VpcIds: [response.VpcId!],
      }),
    );
    if (!describeVpcsResult.Vpcs || describeVpcsResult.Vpcs.length === 0) {
      throw new TransactionError(`VPC with ID ${response.VpcId} does not exist!`);
    }

    // Validate VPC CIDR block.
    const actualVpc = describeVpcsResult.Vpcs[0];
    if (actualVpc.CidrBlock !== properties.CidrBlock) {
      throw new TransactionError(
        `VPC CIDR block mismatch. Expected: ${properties.CidrBlock}, Actual: ${actualVpc.CidrBlock || 'undefined'}`,
      );
    }

    // Validate VPC instance tenancy.
    if (actualVpc.InstanceTenancy !== properties.InstanceTenancy) {
      throw new TransactionError(
        `VPC instance tenancy mismatch. Expected: ${properties.InstanceTenancy}, Actual: ${actualVpc.InstanceTenancy || 'undefined'}`,
      );
    }

    // Validate VPC owner (AWS account).
    if (actualVpc.OwnerId !== properties.awsAccountId) {
      throw new TransactionError(
        `VPC account ID mismatch. Expected: ${properties.awsAccountId}, Actual: ${actualVpc.OwnerId || 'undefined'}`,
      );
    }

    // Validate DNS hostname support.
    const dnsHostnamesResult = await ec2Client.send(
      new DescribeVpcAttributeCommand({
        Attribute: 'enableDnsHostnames' as VpcAttributeName,
        VpcId: response.VpcId,
      }),
    );
    if (dnsHostnamesResult.EnableDnsHostnames?.Value !== true) {
      throw new TransactionError(
        `VPC DNS hostnames not enabled. Expected: true, Actual: ${dnsHostnamesResult.EnableDnsHostnames?.Value || 'undefined'}`,
      );
    }

    // Validate DNS support.
    const dnsSupportResult = await ec2Client.send(
      new DescribeVpcAttributeCommand({
        Attribute: 'enableDnsSupport' as VpcAttributeName,
        VpcId: response.VpcId,
      }),
    );
    if (dnsSupportResult.EnableDnsSupport?.Value !== true) {
      throw new TransactionError(
        `VPC DNS support not enabled. Expected: true, Actual: ${dnsSupportResult.EnableDnsSupport?.Value || 'undefined'}`,
      );
    }

    // Validate VPC ARN format (region should match).
    const expectedArnPrefix = `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:vpc/`;
    if (!response.VpcArn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `VPC ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.VpcArn}`,
      );
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateVpcResourceAction>(ValidateVpcResourceAction)
export class ValidateVpcResourceActionFactory {
  private static instance: ValidateVpcResourceAction;

  static async create(): Promise<ValidateVpcResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateVpcResourceAction();
    }
    return this.instance;
  }
}
