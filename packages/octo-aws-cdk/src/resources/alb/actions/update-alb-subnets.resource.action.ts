import { ElasticLoadBalancingV2Client, SetSubnetsCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { Alb } from '../alb.resource.js';

/**
 * @internal
 */
@Action(Alb)
export class UpdateAlbSubnetsResourceAction extends ANodeAction implements IResourceAction<Alb> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof Alb &&
      hasNodeName(diff.node, 'alb') &&
      diff.field === 'parent' &&
      diff.value === 'subnets'
    );
  }

  async handle(diff: Diff<Alb>): Promise<void> {
    // Get properties.
    const alb = diff.node;
    const properties = alb.properties;
    const response = alb.response;
    const [, , ...matchingAlbSubnets] = alb.parents;

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Update ALB Subnets.
    await elbv2Client.send(
      new SetSubnetsCommand({
        LoadBalancerArn: response.LoadBalancerArn,
        Subnets: matchingAlbSubnets.map((s) => s.getSchemaInstanceInResourceAction().response.SubnetId),
      }),
    );
  }
}

/**
 * @internal
 */
@Factory<UpdateAlbSubnetsResourceAction>(UpdateAlbSubnetsResourceAction)
export class UpdateAlbSubnetsResourceActionFactory {
  private static instance: UpdateAlbSubnetsResourceAction;

  static async create(): Promise<UpdateAlbSubnetsResourceAction> {
    if (!this.instance) {
      this.instance = new UpdateAlbSubnetsResourceAction();
    }
    return this.instance;
  }
}
