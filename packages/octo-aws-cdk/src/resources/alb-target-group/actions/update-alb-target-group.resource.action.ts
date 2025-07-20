import {
  ElasticLoadBalancingV2Client,
  ModifyTargetGroupCommand,
  type ModifyTargetGroupInput,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { AlbTargetGroup } from '../alb-target-group.resource.js';

/**
 * @internal
 */
@Action(AlbTargetGroup)
export class UpdateAlbTargetGroupResourceAction implements IResourceAction<AlbTargetGroup> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof AlbTargetGroup &&
      hasNodeName(diff.node, 'alb-target-group') &&
      diff.field === 'properties'
    );
  }

  async handle(diff: Diff<AlbTargetGroup>): Promise<void> {
    // Get properties.
    const albTargetGroup = diff.node;
    const properties = albTargetGroup.properties;
    const response = albTargetGroup.response;

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    const targetGroupHealthCheck: Partial<ModifyTargetGroupInput> = {};
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

    // Update ALB Target Group.
    await elbv2Client.send(
      new ModifyTargetGroupCommand({
        TargetGroupArn: response.TargetGroupArn,
        ...(Object.keys(targetGroupHealthCheck).length > 0 ? targetGroupHealthCheck : { HealthCheckEnabled: false }),
      }),
    );
  }

  async mock(diff: Diff<AlbTargetGroup>): Promise<void> {
    // Get properties.
    const albTargetGroup = diff.node;
    const properties = albTargetGroup.properties;

    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    elbv2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof ModifyTargetGroupCommand) {
        return;
      }
    };
  }
}

/**
 * @internal
 */
@Factory<UpdateAlbTargetGroupResourceAction>(UpdateAlbTargetGroupResourceAction)
export class UpdateAlbTargetGroupResourceActionFactory {
  private static instance: UpdateAlbTargetGroupResourceAction;

  static async create(): Promise<UpdateAlbTargetGroupResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateAlbTargetGroupResourceAction(container);
    }
    return this.instance;
  }
}
