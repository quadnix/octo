import {
  ElasticLoadBalancingV2Client,
  ModifyListenerCommand,
  type ModifyListenerCommandInput,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import {
  AlbListener,
  type IAlbListenerPropertiesDiff,
  isAlbListenerPropertiesDefaultActionsDiff,
} from '../alb-listener.resource.js';
import type { AlbListenerSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(AlbListener)
export class UpdateAlbListenerResourceAction implements IResourceAction<AlbListener> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff<any, IAlbListenerPropertiesDiff>): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof AlbListener &&
      hasNodeName(diff.node, 'alb-listener') &&
      diff.field === 'properties' &&
      isAlbListenerPropertiesDefaultActionsDiff(diff.value)
    );
  }

  async handle(diff: Diff<AlbListener>): Promise<AlbListenerSchema['response']> {
    // Get properties.
    const albListener = diff.node;
    const properties = albListener.properties;
    const response = albListener.response;
    const [, ...matchingAlbTargetGroups] = albListener.parents;

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

    return response;
  }

  async mock(diff: Diff<AlbListener>): Promise<AlbListenerSchema['response']> {
    const albListener = diff.node;
    return albListener.response;
  }
}

/**
 * @internal
 */
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
