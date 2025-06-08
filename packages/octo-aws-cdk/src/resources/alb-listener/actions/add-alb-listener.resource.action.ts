import { CreateListenerCommand, ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import { AlbListener } from '../alb-listener.resource.js';
import type { AlbListenerSchema } from '../index.schema.js';

@Action(AlbListener)
export class AddAlbListenerResourceAction implements IResourceAction<AlbListener> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AlbListener &&
      (diff.node.constructor as typeof AlbListener).NODE_NAME === 'alb-listener' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const albListener = diff.node as AlbListener;
    const properties = albListener.properties;
    const response = albListener.response;
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
        LoadBalancerArn: matchingAlb.getSchemaInstance().response.LoadBalancerArn,
        Port: properties.Port,
        Protocol: properties.Protocol,
      }),
    );

    // Set response
    response.ListenerArn = createListenerOutput.Listeners![0].ListenerArn!;
    response.Rules = [];
  }

  async mock(diff: Diff, capture: Partial<AlbListenerSchema['response']>): Promise<void> {
    // Get properties.
    const albListener = diff.node as AlbListener;
    const properties = albListener.properties;

    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    elbv2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateListenerCommand) {
        return {
          Listeners: [
            {
              ListenerArn: capture.ListenerArn,
            },
          ],
        };
      }
    };
  }
}

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
