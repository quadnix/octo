import {
  DescribeLoadBalancersCommand,
  type DescribeLoadBalancersCommandOutput,
  ElasticLoadBalancingV2Client,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  type MatchingResource,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import type { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { SecurityGroupSchema } from '../../security-group/index.schema.js';
import type { SubnetSchema } from '../../subnet/index.schema.js';
import { Alb } from '../alb.resource.js';

/**
 * @internal
 */
@Action(Alb)
export class ValidateAlbResourceAction extends ANodeAction implements IResourceAction<Alb> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof Alb &&
      hasNodeName(diff.node, 'alb') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<Alb>): Promise<void> {
    // Get properties.
    const alb = diff.node;
    const properties = alb.properties;
    const response = alb.response;
    const matchingAlbSecurityGroup = alb.parents[1] as MatchingResource<SecurityGroupSchema>;
    const matchingAlbSubnets = alb.parents.slice(2) as MatchingResource<SubnetSchema>[];

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if ALB exists.
    let describeLoadBalancersResult: DescribeLoadBalancersCommandOutput | undefined;
    try {
      describeLoadBalancersResult = await elbv2Client.send(
        new DescribeLoadBalancersCommand({
          LoadBalancerArns: [response.LoadBalancerArn!],
        }),
      );
    } catch (error: any) {
      if (error.name === 'LoadBalancerNotFoundException') {
        throw new TransactionError(`ALB with ARN ${response.LoadBalancerArn} does not exist!`);
      }
      throw error;
    }

    if (!describeLoadBalancersResult.LoadBalancers || describeLoadBalancersResult.LoadBalancers.length === 0) {
      throw new TransactionError(`ALB with ARN ${response.LoadBalancerArn} does not exist!`);
    }

    const actualLoadBalancer = describeLoadBalancersResult.LoadBalancers[0];

    // Validate load balancer ARN.
    if (actualLoadBalancer.LoadBalancerArn !== response.LoadBalancerArn) {
      throw new TransactionError(
        `ALB ARN mismatch. Expected: ${response.LoadBalancerArn}, Actual: ${actualLoadBalancer.LoadBalancerArn || 'undefined'}`,
      );
    }

    // Validate name.
    if (actualLoadBalancer.LoadBalancerName !== properties.Name) {
      throw new TransactionError(
        `ALB name mismatch. Expected: ${properties.Name}, Actual: ${actualLoadBalancer.LoadBalancerName || 'undefined'}`,
      );
    }

    // Validate IP address type.
    if (actualLoadBalancer.IpAddressType !== properties.IpAddressType) {
      throw new TransactionError(
        `ALB IP address type mismatch. Expected: ${properties.IpAddressType}, Actual: ${actualLoadBalancer.IpAddressType || 'undefined'}`,
      );
    }

    // Validate scheme.
    if (actualLoadBalancer.Scheme !== properties.Scheme) {
      throw new TransactionError(
        `ALB scheme mismatch. Expected: ${properties.Scheme}, Actual: ${actualLoadBalancer.Scheme || 'undefined'}`,
      );
    }

    // Validate type.
    if (actualLoadBalancer.Type !== properties.Type) {
      throw new TransactionError(
        `ALB type mismatch. Expected: ${properties.Type}, Actual: ${actualLoadBalancer.Type || 'undefined'}`,
      );
    }

    // Validate DNS name.
    if (!actualLoadBalancer.DNSName) {
      throw new TransactionError('ALB DNS name is missing!');
    }
    if (actualLoadBalancer.DNSName !== response.DNSName) {
      throw new TransactionError(
        `ALB DNS name mismatch. Expected: ${response.DNSName}, Actual: ${actualLoadBalancer.DNSName}`,
      );
    }

    // Validate ARN format (account and region should match).
    const expectedArnPrefix = `arn:aws:elasticloadbalancing:${properties.awsRegionId}:${properties.awsAccountId}:loadbalancer/`;
    if (!response.LoadBalancerArn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `ALB ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.LoadBalancerArn}`,
      );
    }

    // Validate security groups.
    const expectedSecurityGroupId = matchingAlbSecurityGroup.getSchemaInstanceInResourceAction().response.GroupId;
    if (!actualLoadBalancer.SecurityGroups?.includes(expectedSecurityGroupId)) {
      throw new TransactionError(
        `ALB security group mismatch. Expected security group ${expectedSecurityGroupId} not found in: ${JSON.stringify(actualLoadBalancer.SecurityGroups)}`,
      );
    }

    // Validate subnets.
    const expectedSubnetIds = matchingAlbSubnets.map((s) => s.getSchemaInstanceInResourceAction().response.SubnetId!);
    const actualSubnetIds = (actualLoadBalancer.AvailabilityZones || []).map((az) => az.SubnetId);

    if (expectedSubnetIds.length !== actualSubnetIds.length) {
      throw new TransactionError(
        `ALB subnet count mismatch. Expected: ${expectedSubnetIds.length}, Actual: ${actualSubnetIds.length}`,
      );
    }

    for (const expectedSubnetId of expectedSubnetIds) {
      if (!actualSubnetIds.includes(expectedSubnetId)) {
        throw new TransactionError(
          `ALB missing expected subnet: ${expectedSubnetId}. Actual subnets: ${JSON.stringify(actualSubnetIds)}`,
        );
      }
    }

    // Validate state.
    if (actualLoadBalancer.State?.Code !== 'active') {
      throw new TransactionError(
        `ALB is not in active state. Current state: ${actualLoadBalancer.State?.Code || 'undefined'}`,
      );
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateAlbResourceAction>(ValidateAlbResourceAction)
export class ValidateAlbResourceActionFactory {
  private static instance: ValidateAlbResourceAction;

  static async create(): Promise<ValidateAlbResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateAlbResourceAction();
    }
    return this.instance;
  }
}
