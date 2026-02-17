import { ElasticLoadBalancingV2Client, SetSecurityGroupsCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { Alb } from '../alb.resource.js';

/**
 * @internal
 */
@Action(Alb)
export class UpdateAlbSecurityGroupsResourceAction extends ANodeAction implements IResourceAction<Alb> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof Alb &&
      hasNodeName(diff.node, 'alb') &&
      diff.field === 'parent' &&
      diff.value === 'security-groups'
    );
  }

  async handle(diff: Diff<Alb>): Promise<void> {
    // Get properties.
    const alb = diff.node;
    const properties = alb.properties;
    const response = alb.response;
    const matchingAlbSecurityGroup = alb.parents[1];

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Update ALB Security Groups.
    await elbv2Client.send(
      new SetSecurityGroupsCommand({
        LoadBalancerArn: response.LoadBalancerArn,
        SecurityGroups: [matchingAlbSecurityGroup.getSchemaInstanceInResourceAction().response.GroupId],
      }),
    );
  }
}

/**
 * @internal
 */
@Factory<UpdateAlbSecurityGroupsResourceAction>(UpdateAlbSecurityGroupsResourceAction)
export class UpdateAlbSecurityGroupsResourceActionFactory {
  private static instance: UpdateAlbSecurityGroupsResourceAction;

  static async create(): Promise<UpdateAlbSecurityGroupsResourceAction> {
    if (!this.instance) {
      this.instance = new UpdateAlbSecurityGroupsResourceAction();
    }
    return this.instance;
  }
}
