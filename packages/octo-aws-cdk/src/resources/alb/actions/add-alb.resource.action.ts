import { CreateLoadBalancerCommand, ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  Action,
  type BaseResourceSchema,
  Container,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  type MatchingResource,
} from '@quadnix/octo';
import { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { Alb } from '../alb.resource.js';
import type { AlbSchema } from '../index.schema.js';

@Action(Alb)
export class AddAlbResourceAction implements IResourceAction<Alb> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof Alb &&
      (diff.node.constructor as typeof Alb).NODE_NAME === 'alb' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const alb = diff.node as Alb;
    const properties = alb.properties;
    const response = alb.response;
    const matchingAlbSecurityGroup = alb.parents[0];
    const matchingAlbSubnets = alb.parents.slice(1) as MatchingResource<BaseResourceSchema>[];

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
        SecurityGroups: [matchingAlbSecurityGroup.getSchemaInstance().response.GroupId],
        Subnets: matchingAlbSubnets.map((s) => s.getSchemaInstance().response.SubnetId as string),
        Type: properties.Type,
      }),
    );

    // Set response
    response.LoadBalancerArn = createLoadBalancerOutput.LoadBalancers![0].LoadBalancerArn!;
    response.DNSName = createLoadBalancerOutput.LoadBalancers![0].DNSName!;
  }

  async mock(diff: Diff, capture: Partial<AlbSchema['response']>): Promise<void> {
    // Get properties.
    const alb = diff.node as Alb;
    const properties = alb.properties;

    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    elbv2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateLoadBalancerCommand) {
        return {
          LoadBalancers: [
            {
              DNSName: capture.DNSName,
              LoadBalancerArn: capture.LoadBalancerArn,
            },
          ],
        };
      }
    };
  }
}

@Factory<AddAlbResourceAction>(AddAlbResourceAction)
export class AddAlbResourceActionFactory {
  private static instance: AddAlbResourceAction;

  static async create(): Promise<AddAlbResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddAlbResourceAction(container);
    }
    return this.instance;
  }
}
