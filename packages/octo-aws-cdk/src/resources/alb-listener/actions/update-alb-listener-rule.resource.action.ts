import {
  CreateRuleCommand,
  type CreateRuleCommandInput,
  DeleteRuleCommand,
  ElasticLoadBalancingV2Client,
  ModifyRuleCommand,
  type ModifyRuleCommandInput,
} from '@aws-sdk/client-elastic-load-balancing-v2';
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
import type { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import {
  AlbListener,
  type IAlbListenerPropertiesDiff,
  type IAlbListenerRuleDiff,
  isAddRuleDiff,
  isAlbListenerPropertiesRuleDiff,
  isDeleteRuleDiff,
  isUpdateRuleDiff,
} from '../alb-listener.resource.js';
import type { AlbListenerSchema } from '../index.schema.js';

@Action(AlbListener)
export class UpdateAlbListenerRuleResourceAction implements IResourceAction<AlbListener> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof AlbListener &&
      (diff.node.constructor as typeof AlbListener).NODE_NAME === 'alb-listener' &&
      diff.field === 'properties' &&
      isAlbListenerPropertiesRuleDiff(diff.value as IAlbListenerPropertiesDiff)
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const albListener = diff.node as AlbListener;
    const properties = albListener.properties;
    const response = albListener.response;
    const matchingAlbTargetGroups = albListener.parents.slice(1) as MatchingResource<BaseResourceSchema>[];
    const ruleDiff = (diff.value as { Rule: IAlbListenerRuleDiff }).Rule;

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
                    .getSchemaInstance().response.TargetGroupArn! as string,
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
                Host: action.action.Host,
                Path: action.action.Path,
                Port: String(action.action.Port),
                Protocol: action.action.Protocol,
                Query: action.action.Query,
                StatusCode: `HTTP_${action.action.StatusCode}`,
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
      response.Rules.splice(
        response.Rules.findIndex((r) => r.RuleArn === ruleDiff.RuleArn),
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
      response.Rules.splice(
        response.Rules.findIndex((r) => r.RuleArn === ruleDiff.RuleArn),
        1,
        { Priority: ruleDiff.rule.Priority, RuleArn: modifyRuleResponse.Rules![0].RuleArn! },
      );
    }
  }

  async mock(diff: Diff, capture: Partial<AlbListenerSchema['response']>): Promise<void> {
    // Get properties.
    const albListener = diff.node as AlbListener;
    const properties = albListener.properties;
    const ruleDiff = (diff.value as { Rule: IAlbListenerRuleDiff }).Rule;

    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    elbv2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateRuleCommand) {
        return {
          Rules: [
            {
              RuleArn: capture.Rules!.find((r) => r.Priority === ruleDiff.rule.Priority)!.RuleArn,
            },
          ],
        };
      } else if (instance instanceof DeleteRuleCommand) {
        return;
      } else if (instance instanceof ModifyRuleCommand) {
        return {
          Rules: [
            {
              RuleArn: capture.Rules!.find((r) => r.Priority === ruleDiff.rule.Priority)!.RuleArn,
            },
          ],
        };
      }
    };
  }
}

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
