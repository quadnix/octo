import { DeleteListenerCommand, ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { AlbListener } from '../alb-listener.resource.js';

/**
 * @internal
 */
@Action(AlbListener)
export class DeleteAlbListenerResourceAction implements IResourceAction<AlbListener> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof AlbListener &&
      hasNodeName(diff.node, 'alb-listener') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<AlbListener>): Promise<void> {
    // Get properties.
    const albListener = diff.node;
    const properties = albListener.properties;
    const response = albListener.response;

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete ALB Listener.
    await elbv2Client.send(
      new DeleteListenerCommand({
        ListenerArn: response.ListenerArn,
      }),
    );
  }
}

/**
 * @internal
 */
@Factory<DeleteAlbListenerResourceAction>(DeleteAlbListenerResourceAction)
export class DeleteAlbListenerResourceActionFactory {
  private static instance: DeleteAlbListenerResourceAction;

  static async create(): Promise<DeleteAlbListenerResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteAlbListenerResourceAction(container);
    }
    return this.instance;
  }
}
