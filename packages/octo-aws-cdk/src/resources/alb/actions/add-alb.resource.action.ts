import {
  CreateLoadBalancerCommand,
  ElasticLoadBalancingV2Client,
  waitUntilLoadBalancerAvailable,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { Alb } from '../alb.resource.js';
import type { AlbSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(Alb)
export class AddAlbResourceAction extends ANodeAction implements IResourceAction<Alb> {
  actionTimeoutInMs: number = 900000; // 15 minutes.

  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof Alb &&
      hasNodeName(diff.node, 'alb') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<Alb>): Promise<AlbSchema['response']> {
    // Get properties.
    const alb = diff.node;
    const properties = alb.properties;
    const tags = alb.tags;
    const matchingAlbSecurityGroup = alb.parents[1];
    const [, , ...matchingAlbSubnets] = alb.parents;

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create ALB
    const createLoadBalancerOutput = await elbv2Client.send(
      new CreateLoadBalancerCommand({
        IpAddressType: properties.IpAddressType,
        Name: properties.Name,
        Scheme: properties.Scheme,
        SecurityGroups: [matchingAlbSecurityGroup.getSchemaInstanceInResourceAction().response.GroupId],
        Subnets: matchingAlbSubnets.map((s) => s.getSchemaInstanceInResourceAction().response.SubnetId),
        Tags:
          Object.keys(tags).length > 0
            ? Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value }))
            : undefined,
        Type: properties.Type,
      }),
    );
    const LoadBalancerArn = createLoadBalancerOutput.LoadBalancers![0].LoadBalancerArn!;

    // Wait for ALB to become available.
    await waitUntilLoadBalancerAvailable(
      {
        client: elbv2Client,
        maxWaitTime: 840, // 14 minutes.
        minDelay: 30,
      },
      { LoadBalancerArns: [LoadBalancerArn] },
    );

    return {
      DNSName: createLoadBalancerOutput.LoadBalancers![0].DNSName!,
      LoadBalancerArn,
    };
  }

  async mock(_diff: Diff<Alb>, capture: Partial<AlbSchema['response']>): Promise<AlbSchema['response']> {
    return {
      DNSName: capture.DNSName!,
      LoadBalancerArn: capture.LoadBalancerArn!,
    };
  }
}

/**
 * @internal
 */
@Factory<AddAlbResourceAction>(AddAlbResourceAction)
export class AddAlbResourceActionFactory {
  private static instance: AddAlbResourceAction;

  static async create(): Promise<AddAlbResourceAction> {
    if (!this.instance) {
      this.instance = new AddAlbResourceAction();
    }
    return this.instance;
  }
}
