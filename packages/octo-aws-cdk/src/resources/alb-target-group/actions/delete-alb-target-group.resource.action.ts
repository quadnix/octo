import { DeleteTargetGroupCommand, ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { AlbTargetGroup } from '../alb-target-group.resource.js';
import type { AlbTargetGroupSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(AlbTargetGroup)
export class DeleteAlbTargetGroupResourceAction implements IResourceAction<AlbTargetGroup> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof AlbTargetGroup &&
      hasNodeName(diff.node, 'alb-target-group') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<AlbTargetGroup>): Promise<AlbTargetGroupSchema['response']> {
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

    // Delete ALB Target Group
    await elbv2Client.send(
      new DeleteTargetGroupCommand({
        TargetGroupArn: response.TargetGroupArn,
      }),
    );

    return response;
  }

  async mock(diff: Diff<AlbTargetGroup>): Promise<AlbTargetGroupSchema['response']> {
    const albTargetGroup = diff.node;
    return albTargetGroup.response;
  }
}

/**
 * @internal
 */
@Factory<DeleteAlbTargetGroupResourceAction>(DeleteAlbTargetGroupResourceAction)
export class DeleteAlbTargetGroupResourceActionFactory {
  private static instance: DeleteAlbTargetGroupResourceAction;

  static async create(): Promise<DeleteAlbTargetGroupResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteAlbTargetGroupResourceAction(container);
    }
    return this.instance;
  }
}
