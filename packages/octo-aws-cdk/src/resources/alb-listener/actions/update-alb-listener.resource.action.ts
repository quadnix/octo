import {
  CreateListenerCommand,
  ElasticLoadBalancingV2Client,
  ModifyListenerCommand,
  type ModifyListenerCommandInput,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  Action,
  Container,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  type MatchingResource,
} from '@quadnix/octo';
import type { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { AlbTargetGroupSchema } from '../../alb-target-group/index.schema.js';
import {
  AlbListener,
  type IAlbListenerPropertiesDiff,
  isAlbListenerPropertiesDefaultActionsDiff,
} from '../alb-listener.resource.js';
import type { AlbListenerSchema } from '../index.schema.js';

@Action(AlbListener)
export class UpdateAlbListenerResourceAction implements IResourceAction<AlbListener> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof AlbListener &&
      (diff.node.constructor as typeof AlbListener).NODE_NAME === 'alb-listener' &&
      diff.field === 'properties' &&
      isAlbListenerPropertiesDefaultActionsDiff(diff.value as IAlbListenerPropertiesDiff)
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const albListener = diff.node as AlbListener;
    const properties = albListener.properties;
    const response = albListener.response;
    const matchingAlbTargetGroups = albListener.parents.slice(1) as MatchingResource<AlbTargetGroupSchema>[];

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    const buildDefaultActions = (
      action: AlbListenerSchema['properties']['DefaultActions'][0],
    ): Exclude<ModifyListenerCommandInput['DefaultActions'], undefined> => {
      switch (action.actionType) {
        case 'fixed-response':
          return [
            {
              FixedResponseConfig: {
                ContentType: action.action.ContentType,
                MessageBody: action.action.MessageBody,
                StatusCode: String(action.action.StatusCode),
              },
              Type: 'fixed-response',
            },
          ];
        case 'forward':
          return [
            {
              ForwardConfig: {
                TargetGroups: action.action.TargetGroups.map((t) => ({
                  TargetGroupArn: matchingAlbTargetGroups
                    .find((mt) => mt.getSchemaInstance().properties.Name === t.targetGroupName)!
                    .getSchemaInstanceInResourceAction().response.TargetGroupArn,
                  Weight: t.Weight,
                })),
                TargetGroupStickinessConfig: action.action.TargetGroupStickinessConfig
                  ? {
                      DurationSeconds: action.action.TargetGroupStickinessConfig.DurationSeconds,
                      Enabled: action.action.TargetGroupStickinessConfig.Enabled,
                    }
                  : undefined,
              },
              Type: 'forward',
            },
          ];
        case 'redirect':
          return [
            {
              RedirectConfig: {
                Host: action.action.Host ?? undefined,
                Path: action.action.Path ?? undefined,
                Port: action.action.Port ? String(action.action.Port) : undefined,
                Protocol: action.action.Protocol ?? undefined,
                Query: action.action.Query ?? undefined,
                StatusCode: action.action.StatusCode ? `HTTP_${action.action.StatusCode}` : undefined,
              },
              Type: 'redirect',
            },
          ];
        default:
          return [];
      }
    };

    // Update ALB Listener.
    await elbv2Client.send(
      new ModifyListenerCommand({
        DefaultActions: properties.DefaultActions.reduce<
          Exclude<ModifyListenerCommandInput['DefaultActions'], undefined>
        >((accumulator, current) => {
          accumulator.push(...buildDefaultActions(current));
          return accumulator;
        }, []),
        ListenerArn: response.ListenerArn,
        Port: properties.Port,
        Protocol: properties.Protocol,
      }),
    );
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

@Factory<UpdateAlbListenerResourceAction>(UpdateAlbListenerResourceAction)
export class UpdateAlbListenerResourceActionFactory {
  private static instance: UpdateAlbListenerResourceAction;

  static async create(): Promise<UpdateAlbListenerResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateAlbListenerResourceAction(container);
    }
    return this.instance;
  }
}
