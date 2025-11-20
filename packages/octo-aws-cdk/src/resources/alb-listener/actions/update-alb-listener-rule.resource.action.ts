import {
  CreateRuleCommand,
  type CreateRuleCommandInput,
  DeleteRuleCommand,
  ElasticLoadBalancingV2Client,
  ModifyRuleCommand,
  type ModifyRuleCommandInput,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import {
  AlbListener,
  type IAlbListenerPropertiesDiff,
  isAddRuleDiff,
  isAlbListenerPropertiesRuleDiff,
  isDeleteRuleDiff,
  isUpdateRuleDiff,
} from '../alb-listener.resource.js';
import type { AlbListenerSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(AlbListener)
export class UpdateAlbListenerRuleResourceAction implements IResourceAction<AlbListener> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff<any, IAlbListenerPropertiesDiff>): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof AlbListener &&
      hasNodeName(diff.node, 'alb-listener') &&
      diff.field === 'properties' &&
      isAlbListenerPropertiesRuleDiff(diff.value)
    );
  }

  async handle(diff: Diff<AlbListener, IAlbListenerPropertiesDiff>): Promise<AlbListenerSchema['response']> {
    // Get properties.
    const albListener = diff.node;
    const properties = albListener.properties;
    const response = albListener.response;
    const [, ...matchingAlbTargetGroups] = albListener.parents;
    const ruleDiff = diff.value.Rule!;

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    const buildActions = (
      action: AlbListenerSchema['properties']['rules'][0]['actions'][0],
    ): Exclude<CreateRuleCommandInput['Actions'], undefined> => {
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

    const buildConditions = (
      condition: AlbListenerSchema['properties']['rules'][0]['conditions'][0],
    ): Exclude<CreateRuleCommandInput['Conditions'], undefined> => {
      switch (condition.conditionType) {
        case 'host-header':
          return [
            {
              Field: 'host-header',
              HostHeaderConfig: {
                Values: condition.condition.Values,
              },
            },
          ];
        case 'http-header':
          return [
            {
              Field: 'http-header',
              HttpHeaderConfig: {
                HttpHeaderName: condition.condition.HttpHeaderName,
                Values: condition.condition.Values,
              },
            },
          ];
        case 'http-request-method':
          return [
            {
              Field: 'http-request-method',
              HttpRequestMethodConfig: {
                Values: condition.condition.Values,
              },
            },
          ];
        case 'path-pattern':
          return [
            {
              Field: 'path-pattern',
              PathPatternConfig: {
                Values: condition.condition.Values,
              },
            },
          ];
        case 'query-string':
          return [
            {
              Field: 'query-string',
              QueryStringConfig: {
                Values: condition.condition.Values,
              },
            },
          ];
        case 'source-ip':
          return [
            {
              Field: 'source-ip',
              SourceIpConfig: {
                Values: condition.condition.Values,
              },
            },
          ];
        default:
          return [];
      }
    };

    if (isAddRuleDiff(ruleDiff)) {
      const createRuleResponse = await elbv2Client.send(
        new CreateRuleCommand({
          Actions: ruleDiff.rule.actions.reduce<Exclude<CreateRuleCommandInput['Actions'], undefined>>(
            (accumulator, current) => {
              accumulator.push(...buildActions(current));
              return accumulator;
            },
            [],
          ),
          Conditions: ruleDiff.rule.conditions.reduce<Exclude<CreateRuleCommandInput['Conditions'], undefined>>(
            (accumulator, current) => {
              accumulator.push(...buildConditions(current));
              return accumulator;
            },
            [],
          ),
          ListenerArn: response.ListenerArn,
          Priority: ruleDiff.rule.Priority,
        }),
      );

      // Set response.
      if (!response.Rules) {
        response.Rules = [];
      }
      response.Rules.push({ Priority: ruleDiff.rule.Priority, RuleArn: createRuleResponse.Rules![0].RuleArn! });
    } else if (isDeleteRuleDiff(ruleDiff)) {
      await elbv2Client.send(
        new DeleteRuleCommand({
          RuleArn: ruleDiff.RuleArn,
        }),
      );

      // Set response.
      response.Rules!.splice(
        response.Rules!.findIndex((r) => r.RuleArn === ruleDiff.RuleArn),
        1,
      );
    } else if (isUpdateRuleDiff(ruleDiff)) {
      const modifyRuleResponse = await elbv2Client.send(
        new ModifyRuleCommand({
          Actions: ruleDiff.rule.actions.reduce<Exclude<ModifyRuleCommandInput['Actions'], undefined>>(
            (accumulator, current) => {
              accumulator.push(...buildActions(current));
              return accumulator;
            },
            [],
          ),
          Conditions: ruleDiff.rule.conditions.reduce<Exclude<ModifyRuleCommandInput['Conditions'], undefined>>(
            (accumulator, current) => {
              accumulator.push(...buildConditions(current));
              return accumulator;
            },
            [],
          ),
          RuleArn: ruleDiff.RuleArn,
        }),
      );

      // Set response.
      response.Rules!.splice(
        response.Rules!.findIndex((r) => r.RuleArn === ruleDiff.RuleArn),
        1,
        { Priority: ruleDiff.rule.Priority, RuleArn: modifyRuleResponse.Rules![0].RuleArn! },
      );
    }

    return response;
  }

  async mock(
    diff: Diff<AlbListener, IAlbListenerPropertiesDiff>,
    capture: Partial<AlbListenerSchema['response']>,
  ): Promise<AlbListenerSchema['response']> {
    // Get properties.
    const albListener = diff.node;
    const response = albListener.response;
    const ruleDiff = diff.value.Rule!;

    if (isAddRuleDiff(ruleDiff)) {
      if (!response.Rules) {
        response.Rules = [];
      }
      response.Rules.push({
        Priority: ruleDiff.rule.Priority,
        RuleArn: capture.Rules!.find((r) => r.Priority === ruleDiff.rule.Priority)!.RuleArn,
      });
    } else if (isDeleteRuleDiff(ruleDiff)) {
      response.Rules!.splice(
        response.Rules!.findIndex((r) => r.RuleArn === ruleDiff.RuleArn),
        1,
      );
    } else if (isUpdateRuleDiff(ruleDiff)) {
      response.Rules!.splice(
        response.Rules!.findIndex((r) => r.RuleArn === ruleDiff.RuleArn),
        1,
        {
          Priority: ruleDiff.rule.Priority,
          RuleArn: capture.Rules!.find((r) => r.Priority === ruleDiff.rule.Priority)!.RuleArn,
        },
      );
    }

    return response;
  }
}

/**
 * @internal
 */
@Factory<UpdateAlbListenerRuleResourceAction>(UpdateAlbListenerRuleResourceAction)
export class UpdateAlbListenerRuleResourceActionFactory {
  private static instance: UpdateAlbListenerRuleResourceAction;

  static async create(): Promise<UpdateAlbListenerRuleResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateAlbListenerRuleResourceAction(container);
    }
    return this.instance;
  }
}
