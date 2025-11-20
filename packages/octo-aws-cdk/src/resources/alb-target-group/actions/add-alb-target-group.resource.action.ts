import {
  CreateTargetGroupCommand,
  type CreateTargetGroupInput,
  ElasticLoadBalancingV2Client,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { AlbTargetGroup } from '../alb-target-group.resource.js';
import type { AlbTargetGroupSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(AlbTargetGroup)
export class AddAlbTargetGroupResourceAction implements IResourceAction<AlbTargetGroup> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AlbTargetGroup &&
      hasNodeName(diff.node, 'alb-target-group') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<AlbTargetGroup>): Promise<AlbTargetGroupSchema['response']> {
    // Get properties.
    const albTargetGroup = diff.node;
    const properties = albTargetGroup.properties;
    const tags = albTargetGroup.tags;
    const matchingAlbTargetGroupVpc = albTargetGroup.parents[0];

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    const targetGroupHealthCheck: Partial<CreateTargetGroupInput> = {};
    if (properties.healthCheck) {
      targetGroupHealthCheck.HealthCheckEnabled = true;
      targetGroupHealthCheck.HealthCheckIntervalSeconds = properties.healthCheck.HealthCheckIntervalSeconds;
      targetGroupHealthCheck.HealthCheckPath = properties.healthCheck.HealthCheckPath;
      targetGroupHealthCheck.HealthCheckPort = String(properties.healthCheck.HealthCheckPort);
      targetGroupHealthCheck.HealthCheckProtocol = properties.healthCheck.HealthCheckProtocol;
      targetGroupHealthCheck.HealthCheckTimeoutSeconds = properties.healthCheck.HealthCheckTimeoutSeconds;
      targetGroupHealthCheck.HealthyThresholdCount = properties.healthCheck.HealthyThresholdCount;
      targetGroupHealthCheck.Matcher = {
        HttpCode: String(properties.healthCheck.Matcher.HttpCode),
      };
      targetGroupHealthCheck.UnhealthyThresholdCount = properties.healthCheck.UnhealthyThresholdCount;
    }

    // Create ALB Target Group.
    const createTargetGroupOutput = await elbv2Client.send(
      new CreateTargetGroupCommand({
        IpAddressType: properties.IpAddressType,
        Name: properties.Name,
        Port: properties.Port,
        Protocol: properties.Protocol,
        ProtocolVersion: properties.ProtocolVersion,
        Tags: Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })),
        TargetType: properties.TargetType,
        VpcId: matchingAlbTargetGroupVpc.getSchemaInstanceInResourceAction().response.VpcId,
        ...(Object.keys(targetGroupHealthCheck).length > 0 ? targetGroupHealthCheck : { HealthCheckEnabled: false }),
      }),
    );

    return {
      TargetGroupArn: createTargetGroupOutput.TargetGroups![0].TargetGroupArn!,
    };
  }

  async mock(
    _diff: Diff<AlbTargetGroup>,
    capture: Partial<AlbTargetGroupSchema['response']>,
  ): Promise<AlbTargetGroupSchema['response']> {
    return {
      TargetGroupArn: capture.TargetGroupArn,
    };
  }
}

/**
 * @internal
 */
@Factory<AddAlbTargetGroupResourceAction>(AddAlbTargetGroupResourceAction)
export class AddAlbTargetGroupResourceActionFactory {
  private static instance: AddAlbTargetGroupResourceAction;

  static async create(): Promise<AddAlbTargetGroupResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddAlbTargetGroupResourceAction(container);
    }
    return this.instance;
  }
}
