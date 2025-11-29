import {
  DescribeTargetGroupsCommand,
  type DescribeTargetGroupsCommandOutput,
  ElasticLoadBalancingV2Client,
} from '@aws-sdk/client-elastic-load-balancing-v2';
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
import { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { AlbTargetGroup } from '../alb-target-group.resource.js';

/**
 * @internal
 */
@Action(AlbTargetGroup)
export class ValidateAlbTargetGroupResourceAction extends ANodeAction implements IResourceAction<AlbTargetGroup> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof AlbTargetGroup &&
      hasNodeName(diff.node, 'alb-target-group') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<AlbTargetGroup>): Promise<void> {
    // Get properties.
    const albTargetGroup = diff.node;
    const properties = albTargetGroup.properties;
    const response = albTargetGroup.response;
    const matchingAlbTargetGroupVpc = albTargetGroup.parents[0];

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if ALB Target Group exists.
    let describeTargetGroupsResult: DescribeTargetGroupsCommandOutput | undefined;
    try {
      describeTargetGroupsResult = await elbv2Client.send(
        new DescribeTargetGroupsCommand({
          TargetGroupArns: [response.TargetGroupArn!],
        }),
      );
    } catch (error: any) {
      if (error.name === 'TargetGroupNotFoundException') {
        throw new TransactionError(`ALB Target Group with ARN ${response.TargetGroupArn} does not exist!`);
      }
      throw error;
    }

    if (!describeTargetGroupsResult.TargetGroups || describeTargetGroupsResult.TargetGroups.length === 0) {
      throw new TransactionError(`ALB Target Group with ARN ${response.TargetGroupArn} does not exist!`);
    }

    const actualTargetGroup = describeTargetGroupsResult.TargetGroups[0];

    // Validate target group ARN.
    if (actualTargetGroup.TargetGroupArn !== response.TargetGroupArn) {
      throw new TransactionError(
        `ALB Target Group ARN mismatch. Expected: ${response.TargetGroupArn}, Actual: ${actualTargetGroup.TargetGroupArn || 'undefined'}`,
      );
    }

    // Validate target group name.
    if (actualTargetGroup.TargetGroupName !== properties.Name) {
      throw new TransactionError(
        `ALB Target Group name mismatch. Expected: ${properties.Name}, Actual: ${actualTargetGroup.TargetGroupName || 'undefined'}`,
      );
    }

    // Validate VPC ID (parent).
    const expectedVpcId = matchingAlbTargetGroupVpc.getSchemaInstanceInResourceAction().response.VpcId;
    if (actualTargetGroup.VpcId !== expectedVpcId) {
      throw new TransactionError(
        `ALB Target Group VPC mismatch. Expected: ${expectedVpcId}, Actual: ${actualTargetGroup.VpcId || 'undefined'}`,
      );
    }

    // Validate port.
    if (actualTargetGroup.Port !== properties.Port) {
      throw new TransactionError(
        `ALB Target Group port mismatch. Expected: ${properties.Port}, Actual: ${actualTargetGroup.Port || 'undefined'}`,
      );
    }

    // Validate protocol.
    if (actualTargetGroup.Protocol !== properties.Protocol) {
      throw new TransactionError(
        `ALB Target Group protocol mismatch. Expected: ${properties.Protocol}, Actual: ${actualTargetGroup.Protocol || 'undefined'}`,
      );
    }

    // Validate protocol version.
    if (actualTargetGroup.ProtocolVersion !== properties.ProtocolVersion) {
      throw new TransactionError(
        `ALB Target Group protocol version mismatch. Expected: ${properties.ProtocolVersion}, Actual: ${actualTargetGroup.ProtocolVersion || 'undefined'}`,
      );
    }

    // Validate target type.
    if (actualTargetGroup.TargetType !== properties.TargetType) {
      throw new TransactionError(
        `ALB Target Group target type mismatch. Expected: ${properties.TargetType}, Actual: ${actualTargetGroup.TargetType || 'undefined'}`,
      );
    }

    // Validate IP address type.
    if (actualTargetGroup.IpAddressType !== properties.IpAddressType) {
      throw new TransactionError(
        `ALB Target Group IP address type mismatch. Expected: ${properties.IpAddressType}, Actual: ${actualTargetGroup.IpAddressType || 'undefined'}`,
      );
    }

    // Validate ARN format (account and region should match).
    const expectedArnPrefix = `arn:aws:elasticloadbalancing:${properties.awsRegionId}:${properties.awsAccountId}:targetgroup/`;
    if (!response.TargetGroupArn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `ALB Target Group ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.TargetGroupArn}`,
      );
    }

    // Validate health check configuration.
    if (properties.healthCheck) {
      if (!actualTargetGroup.HealthCheckEnabled) {
        throw new TransactionError('ALB Target Group health check is not enabled but is expected to be enabled!');
      }

      if (actualTargetGroup.HealthCheckIntervalSeconds !== properties.healthCheck.HealthCheckIntervalSeconds) {
        throw new TransactionError(
          `ALB Target Group health check interval mismatch. Expected: ${properties.healthCheck.HealthCheckIntervalSeconds}, Actual: ${actualTargetGroup.HealthCheckIntervalSeconds || 'undefined'}`,
        );
      }

      if (actualTargetGroup.HealthCheckPath !== properties.healthCheck.HealthCheckPath) {
        throw new TransactionError(
          `ALB Target Group health check path mismatch. Expected: ${properties.healthCheck.HealthCheckPath}, Actual: ${actualTargetGroup.HealthCheckPath || 'undefined'}`,
        );
      }

      if (actualTargetGroup.HealthCheckPort !== String(properties.healthCheck.HealthCheckPort)) {
        throw new TransactionError(
          `ALB Target Group health check port mismatch. Expected: ${properties.healthCheck.HealthCheckPort}, Actual: ${actualTargetGroup.HealthCheckPort || 'undefined'}`,
        );
      }

      if (actualTargetGroup.HealthCheckProtocol !== properties.healthCheck.HealthCheckProtocol) {
        throw new TransactionError(
          `ALB Target Group health check protocol mismatch. Expected: ${properties.healthCheck.HealthCheckProtocol}, Actual: ${actualTargetGroup.HealthCheckProtocol || 'undefined'}`,
        );
      }

      if (actualTargetGroup.HealthCheckTimeoutSeconds !== properties.healthCheck.HealthCheckTimeoutSeconds) {
        throw new TransactionError(
          `ALB Target Group health check timeout mismatch. Expected: ${properties.healthCheck.HealthCheckTimeoutSeconds}, Actual: ${actualTargetGroup.HealthCheckTimeoutSeconds || 'undefined'}`,
        );
      }

      if (actualTargetGroup.HealthyThresholdCount !== properties.healthCheck.HealthyThresholdCount) {
        throw new TransactionError(
          `ALB Target Group healthy threshold count mismatch. Expected: ${properties.healthCheck.HealthyThresholdCount}, Actual: ${actualTargetGroup.HealthyThresholdCount || 'undefined'}`,
        );
      }

      if (actualTargetGroup.UnhealthyThresholdCount !== properties.healthCheck.UnhealthyThresholdCount) {
        throw new TransactionError(
          `ALB Target Group unhealthy threshold count mismatch. Expected: ${properties.healthCheck.UnhealthyThresholdCount}, Actual: ${actualTargetGroup.UnhealthyThresholdCount || 'undefined'}`,
        );
      }

      if (actualTargetGroup.Matcher?.HttpCode !== String(properties.healthCheck.Matcher.HttpCode)) {
        throw new TransactionError(
          `ALB Target Group health check matcher HTTP code mismatch. Expected: ${properties.healthCheck.Matcher.HttpCode}, Actual: ${actualTargetGroup.Matcher?.HttpCode || 'undefined'}`,
        );
      }
    } else {
      // If health check is not configured, verify it's disabled.
      if (actualTargetGroup.HealthCheckEnabled === true) {
        throw new TransactionError(
          'ALB Target Group health check is enabled but is expected to be disabled!',
        );
      }
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateAlbTargetGroupResourceAction>(ValidateAlbTargetGroupResourceAction)
export class ValidateAlbTargetGroupResourceActionFactory {
  private static instance: ValidateAlbTargetGroupResourceAction;

  static async create(): Promise<ValidateAlbTargetGroupResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateAlbTargetGroupResourceAction();
    }
    return this.instance;
  }
}

