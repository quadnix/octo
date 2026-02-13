import { CreateListenerCommand, ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { AlbListener } from '../alb-listener.resource.js';
import type { AlbListenerSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(AlbListener)
export class AddAlbListenerResourceAction implements IResourceAction<AlbListener> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AlbListener &&
      hasNodeName(diff.node, 'alb-listener') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<AlbListener>): Promise<AlbListenerSchema['response']> {
    // Get properties.
    const albListener = diff.node;
    const properties = albListener.properties;
    const tags = albListener.tags;
    const matchingAlb = albListener.parents[0];

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create ALB Listener with a dummy default action.
    const createListenerOutput = await elbv2Client.send(
      new CreateListenerCommand({
        DefaultActions: [
          {
            FixedResponseConfig: {
              ContentType: 'text/plain',
              MessageBody: 'Not Found',
              StatusCode: '404',
            },
            Type: 'fixed-response',
          },
        ],
        LoadBalancerArn: matchingAlb.getSchemaInstanceInResourceAction().response.LoadBalancerArn,
        Port: properties.Port,
        Protocol: properties.Protocol,
        Tags:
          Object.keys(tags).length > 0
            ? Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value }))
            : undefined,
      }),
    );

    return {
      ListenerArn: createListenerOutput.Listeners![0].ListenerArn!,
      Rules: [],
    };
  }

  async mock(
    _diff: Diff<AlbListener>,
    capture: Partial<AlbListenerSchema['response']>,
  ): Promise<AlbListenerSchema['response']> {
    return {
      ListenerArn: capture.ListenerArn!,
      Rules: [],
    };
  }
}

/**
 * @internal
 */
@Factory<AddAlbListenerResourceAction>(AddAlbListenerResourceAction)
export class AddAlbListenerResourceActionFactory {
  private static instance: AddAlbListenerResourceAction;

  static async create(): Promise<AddAlbListenerResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddAlbListenerResourceAction(container);
    }
    return this.instance;
  }
}
