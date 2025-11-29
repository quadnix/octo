import {
  DescribeListenersCommand,
  type DescribeListenersCommandOutput,
  DescribeRulesCommand,
  ElasticLoadBalancingV2Client,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  type MatchingResource,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import type { ElasticLoadBalancingV2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { AlbTargetGroupSchema } from '../../alb-target-group/index.schema.js';
import { AlbListener } from '../alb-listener.resource.js';

/**
 * @internal
 */
@Action(AlbListener)
export class ValidateAlbListenerResourceAction extends ANodeAction implements IResourceAction<AlbListener> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
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
    const matchingAlb = albListener.parents[0];
    const matchingAlbTargetGroups = albListener.parents.slice(1) as MatchingResource<AlbTargetGroupSchema>[];

    // Get instances.
    const elbv2Client = await this.container.get<
      ElasticLoadBalancingV2Client,
      typeof ElasticLoadBalancingV2ClientFactory
    >(ElasticLoadBalancingV2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if ALB Listener exists.
    let describeListenersResult: DescribeListenersCommandOutput | undefined;
    try {
      describeListenersResult = await elbv2Client.send(
        new DescribeListenersCommand({
          ListenerArns: [response.ListenerArn!],
        }),
      );
    } catch (error: any) {
      if (error.name === 'ListenerNotFoundException') {
        throw new TransactionError(`ALB Listener with ARN ${response.ListenerArn} does not exist!`);
      }
      throw error;
    }

    if (!describeListenersResult.Listeners || describeListenersResult.Listeners.length === 0) {
      throw new TransactionError(`ALB Listener with ARN ${response.ListenerArn} does not exist!`);
    }

    const actualListener = describeListenersResult.Listeners[0];

    // Validate listener ARN.
    if (actualListener.ListenerArn !== response.ListenerArn) {
      throw new TransactionError(
        `ALB Listener ARN mismatch. Expected: ${response.ListenerArn}, Actual: ${actualListener.ListenerArn || 'undefined'}`,
      );
    }

    // Validate load balancer ARN (parent).
    const expectedLoadBalancerArn = matchingAlb.getSchemaInstanceInResourceAction().response.LoadBalancerArn;
    if (actualListener.LoadBalancerArn !== expectedLoadBalancerArn) {
      throw new TransactionError(
        `ALB Listener load balancer ARN mismatch. Expected: ${expectedLoadBalancerArn}, Actual: ${actualListener.LoadBalancerArn || 'undefined'}`,
      );
    }

    // Validate port.
    if (actualListener.Port !== properties.Port) {
      throw new TransactionError(
        `ALB Listener port mismatch. Expected: ${properties.Port}, Actual: ${actualListener.Port || 'undefined'}`,
      );
    }

    // Validate protocol.
    if (actualListener.Protocol !== properties.Protocol) {
      throw new TransactionError(
        `ALB Listener protocol mismatch. Expected: ${properties.Protocol}, Actual: ${actualListener.Protocol || 'undefined'}`,
      );
    }

    // Validate ARN format (account and region should match).
    const expectedArnPrefix = `arn:aws:elasticloadbalancing:${properties.awsRegionId}:${properties.awsAccountId}:listener/`;
    if (!response.ListenerArn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `ALB Listener ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.ListenerArn}`,
      );
    }

    // Validate default actions.
    if (!actualListener.DefaultActions || actualListener.DefaultActions.length !== properties.DefaultActions.length) {
      throw new TransactionError(
        `ALB Listener default actions count mismatch. Expected: ${properties.DefaultActions.length}, Actual: ${actualListener.DefaultActions?.length || 0}`,
      );
    }

    for (const expectedAction of properties.DefaultActions) {
      if (expectedAction.actionType === 'fixed-response') {
        const actualAction = actualListener.DefaultActions.find((a) => a.Type === 'fixed-response');
        if (!actualAction) {
          throw new TransactionError('ALB Listener missing fixed-response default action');
        }

        if (actualAction.FixedResponseConfig?.ContentType !== expectedAction.action.ContentType) {
          throw new TransactionError(
            `ALB Listener fixed-response content type mismatch. Expected: ${expectedAction.action.ContentType}, Actual: ${actualAction.FixedResponseConfig?.ContentType || 'undefined'}`,
          );
        }

        if (actualAction.FixedResponseConfig?.MessageBody !== expectedAction.action.MessageBody) {
          throw new TransactionError(
            `ALB Listener fixed-response message body mismatch. Expected: ${expectedAction.action.MessageBody}, Actual: ${actualAction.FixedResponseConfig?.MessageBody || 'undefined'}`,
          );
        }

        if (actualAction.FixedResponseConfig?.StatusCode !== String(expectedAction.action.StatusCode)) {
          throw new TransactionError(
            `ALB Listener fixed-response status code mismatch. Expected: ${expectedAction.action.StatusCode}, Actual: ${actualAction.FixedResponseConfig?.StatusCode || 'undefined'}`,
          );
        }
      } else if (expectedAction.actionType === 'forward') {
        const actualAction = actualListener.DefaultActions.find((a) => a.Type === 'forward');
        if (!actualAction) {
          throw new TransactionError('ALB Listener missing forward default action');
        }

        const expectedTargetGroups = expectedAction.action.TargetGroups;
        const actualTargetGroups = actualAction.ForwardConfig?.TargetGroups || [];

        if (actualTargetGroups.length !== expectedTargetGroups.length) {
          throw new TransactionError(
            `ALB Listener forward action target groups count mismatch. Expected: ${expectedTargetGroups.length}, Actual: ${actualTargetGroups.length}`,
          );
        }

        for (const expectedTg of expectedTargetGroups) {
          const expectedTgArn = matchingAlbTargetGroups
            .find((mt) => mt.getSchemaInstance().properties.Name === expectedTg.targetGroupName)!
            .getSchemaInstanceInResourceAction().response.TargetGroupArn;

          const actualTg = actualTargetGroups.find((t) => t.TargetGroupArn === expectedTgArn);
          if (!actualTg) {
            throw new TransactionError(
              `ALB Listener forward action missing target group: ${expectedTg.targetGroupName}`,
            );
          }

          if (actualTg.Weight !== expectedTg.Weight) {
            throw new TransactionError(
              `ALB Listener forward action target group ${expectedTg.targetGroupName} weight mismatch. Expected: ${expectedTg.Weight}, Actual: ${actualTg.Weight}`,
            );
          }
        }

        // Validate stickiness config.
        if (expectedAction.action.TargetGroupStickinessConfig) {
          if (!actualAction.ForwardConfig?.TargetGroupStickinessConfig) {
            throw new TransactionError('ALB Listener forward action missing stickiness configuration');
          }

          if (
            actualAction.ForwardConfig.TargetGroupStickinessConfig.Enabled !==
            expectedAction.action.TargetGroupStickinessConfig.Enabled
          ) {
            throw new TransactionError(
              `ALB Listener forward action stickiness enabled mismatch. Expected: ${expectedAction.action.TargetGroupStickinessConfig.Enabled}, Actual: ${actualAction.ForwardConfig.TargetGroupStickinessConfig.Enabled}`,
            );
          }

          if (
            actualAction.ForwardConfig.TargetGroupStickinessConfig.DurationSeconds !==
            expectedAction.action.TargetGroupStickinessConfig.DurationSeconds
          ) {
            throw new TransactionError(
              `ALB Listener forward action stickiness duration mismatch. Expected: ${expectedAction.action.TargetGroupStickinessConfig.DurationSeconds}, Actual: ${actualAction.ForwardConfig.TargetGroupStickinessConfig.DurationSeconds}`,
            );
          }
        }
      } else if (expectedAction.actionType === 'redirect') {
        const actualAction = actualListener.DefaultActions.find((a) => a.Type === 'redirect');
        if (!actualAction) {
          throw new TransactionError('ALB Listener missing redirect default action');
        }

        const expectedRedirect = expectedAction.action;
        const actualRedirect = actualAction.RedirectConfig;

        if (actualRedirect?.Host !== (expectedRedirect.Host ?? undefined)) {
          throw new TransactionError(
            `ALB Listener redirect host mismatch. Expected: ${expectedRedirect.Host}, Actual: ${actualRedirect?.Host || 'undefined'}`,
          );
        }

        if (actualRedirect?.Path !== (expectedRedirect.Path ?? undefined)) {
          throw new TransactionError(
            `ALB Listener redirect path mismatch. Expected: ${expectedRedirect.Path}, Actual: ${actualRedirect?.Path || 'undefined'}`,
          );
        }

        if (actualRedirect?.Port !== (expectedRedirect.Port ? String(expectedRedirect.Port) : undefined)) {
          throw new TransactionError(
            `ALB Listener redirect port mismatch. Expected: ${expectedRedirect.Port}, Actual: ${actualRedirect?.Port || 'undefined'}`,
          );
        }

        if (actualRedirect?.Protocol !== (expectedRedirect.Protocol ?? undefined)) {
          throw new TransactionError(
            `ALB Listener redirect protocol mismatch. Expected: ${expectedRedirect.Protocol}, Actual: ${actualRedirect?.Protocol || 'undefined'}`,
          );
        }

        if (actualRedirect?.Query !== (expectedRedirect.Query ?? undefined)) {
          throw new TransactionError(
            `ALB Listener redirect query mismatch. Expected: ${expectedRedirect.Query}, Actual: ${actualRedirect?.Query || 'undefined'}`,
          );
        }

        const expectedStatusCode = expectedRedirect.StatusCode ? `HTTP_${expectedRedirect.StatusCode}` : undefined;
        if (actualRedirect?.StatusCode !== expectedStatusCode) {
          throw new TransactionError(
            `ALB Listener redirect status code mismatch. Expected: ${expectedStatusCode}, Actual: ${actualRedirect?.StatusCode || 'undefined'}`,
          );
        }
      }
    }

    // Validate rules.
    if (properties.rules.length > 0) {
      const describeRulesResult = await elbv2Client.send(
        new DescribeRulesCommand({
          ListenerArn: response.ListenerArn,
        }),
      );

      const actualRules = (describeRulesResult.Rules || []).filter((r) => !r.IsDefault);

      if (actualRules.length !== properties.rules.length) {
        throw new TransactionError(
          `ALB Listener rules count mismatch. Expected: ${properties.rules.length}, Actual: ${actualRules.length}`,
        );
      }

      for (const expectedRule of properties.rules) {
        const expectedRuleResponse = response.Rules?.find((r) => r.Priority === expectedRule.Priority);
        if (!expectedRuleResponse) {
          throw new TransactionError(`ALB Listener missing rule response for priority: ${expectedRule.Priority}`);
        }

        const actualRule = actualRules.find((r) => r.RuleArn === expectedRuleResponse.RuleArn);
        if (!actualRule) {
          throw new TransactionError(
            `ALB Listener missing rule with ARN: ${expectedRuleResponse.RuleArn} at priority ${expectedRule.Priority}`,
          );
        }

        // Validate rule priority.
        if (actualRule.Priority !== String(expectedRule.Priority)) {
          throw new TransactionError(
            `ALB Listener rule priority mismatch. Expected: ${expectedRule.Priority}, Actual: ${actualRule.Priority || 'undefined'}`,
          );
        }

        // Validate rule conditions.
        const actualConditions = actualRule.Conditions || [];
        if (actualConditions.length !== expectedRule.conditions.length) {
          throw new TransactionError(
            `ALB Listener rule (priority ${expectedRule.Priority}) conditions count mismatch. Expected: ${expectedRule.conditions.length}, Actual: ${actualConditions.length}`,
          );
        }

        for (const expectedCondition of expectedRule.conditions) {
          const actualCondition = actualConditions.find((c) => c.Field === expectedCondition.conditionType);
          if (!actualCondition) {
            throw new TransactionError(
              `ALB Listener rule (priority ${expectedRule.Priority}) missing condition type: ${expectedCondition.conditionType}`,
            );
          }

          // Validate condition values based on type.
          switch (expectedCondition.conditionType) {
            case 'host-header':
              if (
                JSON.stringify(actualCondition.HostHeaderConfig?.Values) !==
                JSON.stringify(expectedCondition.condition.Values)
              ) {
                throw new TransactionError(
                  `ALB Listener rule (priority ${expectedRule.Priority}) host-header values mismatch. Expected: ${JSON.stringify(expectedCondition.condition.Values)}, Actual: ${JSON.stringify(actualCondition.HostHeaderConfig?.Values)}`,
                );
              }
              break;
            case 'http-header':
              if (actualCondition.HttpHeaderConfig?.HttpHeaderName !== expectedCondition.condition.HttpHeaderName) {
                throw new TransactionError(
                  `ALB Listener rule (priority ${expectedRule.Priority}) http-header name mismatch. Expected: ${expectedCondition.condition.HttpHeaderName}, Actual: ${actualCondition.HttpHeaderConfig?.HttpHeaderName}`,
                );
              }
              if (
                JSON.stringify(actualCondition.HttpHeaderConfig?.Values) !==
                JSON.stringify(expectedCondition.condition.Values)
              ) {
                throw new TransactionError(
                  `ALB Listener rule (priority ${expectedRule.Priority}) http-header values mismatch. Expected: ${JSON.stringify(expectedCondition.condition.Values)}, Actual: ${JSON.stringify(actualCondition.HttpHeaderConfig?.Values)}`,
                );
              }
              break;
            case 'http-request-method':
              if (
                JSON.stringify(actualCondition.HttpRequestMethodConfig?.Values) !==
                JSON.stringify(expectedCondition.condition.Values)
              ) {
                throw new TransactionError(
                  `ALB Listener rule (priority ${expectedRule.Priority}) http-request-method values mismatch. Expected: ${JSON.stringify(expectedCondition.condition.Values)}, Actual: ${JSON.stringify(actualCondition.HttpRequestMethodConfig?.Values)}`,
                );
              }
              break;
            case 'path-pattern':
              if (
                JSON.stringify(actualCondition.PathPatternConfig?.Values) !==
                JSON.stringify(expectedCondition.condition.Values)
              ) {
                throw new TransactionError(
                  `ALB Listener rule (priority ${expectedRule.Priority}) path-pattern values mismatch. Expected: ${JSON.stringify(expectedCondition.condition.Values)}, Actual: ${JSON.stringify(actualCondition.PathPatternConfig?.Values)}`,
                );
              }
              break;
            case 'query-string':
              if (
                JSON.stringify(actualCondition.QueryStringConfig?.Values) !==
                JSON.stringify(expectedCondition.condition.Values)
              ) {
                throw new TransactionError(
                  `ALB Listener rule (priority ${expectedRule.Priority}) query-string values mismatch. Expected: ${JSON.stringify(expectedCondition.condition.Values)}, Actual: ${JSON.stringify(actualCondition.QueryStringConfig?.Values)}`,
                );
              }
              break;
            case 'source-ip':
              if (
                JSON.stringify(actualCondition.SourceIpConfig?.Values) !==
                JSON.stringify(expectedCondition.condition.Values)
              ) {
                throw new TransactionError(
                  `ALB Listener rule (priority ${expectedRule.Priority}) source-ip values mismatch. Expected: ${JSON.stringify(expectedCondition.condition.Values)}, Actual: ${JSON.stringify(actualCondition.SourceIpConfig?.Values)}`,
                );
              }
              break;
          }
        }

        // Validate rule actions.
        const actualActions = actualRule.Actions || [];
        if (actualActions.length !== expectedRule.actions.length) {
          throw new TransactionError(
            `ALB Listener rule (priority ${expectedRule.Priority}) actions count mismatch. Expected: ${expectedRule.actions.length}, Actual: ${actualActions.length}`,
          );
        }

        for (const expectedAction of expectedRule.actions) {
          if (expectedAction.actionType === 'fixed-response') {
            const actualAction = actualActions.find((a) => a.Type === 'fixed-response');
            if (!actualAction) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) missing fixed-response action`,
              );
            }

            if (actualAction.FixedResponseConfig?.ContentType !== expectedAction.action.ContentType) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) fixed-response content type mismatch. Expected: ${expectedAction.action.ContentType}, Actual: ${actualAction.FixedResponseConfig?.ContentType}`,
              );
            }

            if (actualAction.FixedResponseConfig?.MessageBody !== expectedAction.action.MessageBody) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) fixed-response message body mismatch. Expected: ${expectedAction.action.MessageBody}, Actual: ${actualAction.FixedResponseConfig?.MessageBody}`,
              );
            }

            if (actualAction.FixedResponseConfig?.StatusCode !== String(expectedAction.action.StatusCode)) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) fixed-response status code mismatch. Expected: ${expectedAction.action.StatusCode}, Actual: ${actualAction.FixedResponseConfig?.StatusCode}`,
              );
            }
          } else if (expectedAction.actionType === 'forward') {
            const actualAction = actualActions.find((a) => a.Type === 'forward');
            if (!actualAction) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) missing forward action`,
              );
            }

            const expectedTargetGroups = expectedAction.action.TargetGroups;
            const actualTargetGroups = actualAction.ForwardConfig?.TargetGroups || [];

            if (actualTargetGroups.length !== expectedTargetGroups.length) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) forward action target groups count mismatch. Expected: ${expectedTargetGroups.length}, Actual: ${actualTargetGroups.length}`,
              );
            }

            for (const expectedTg of expectedTargetGroups) {
              const expectedTgArn = matchingAlbTargetGroups
                .find((mt) => mt.getSchemaInstance().properties.Name === expectedTg.targetGroupName)!
                .getSchemaInstanceInResourceAction().response.TargetGroupArn;

              const actualTg = actualTargetGroups.find((t) => t.TargetGroupArn === expectedTgArn);
              if (!actualTg) {
                throw new TransactionError(
                  `ALB Listener rule (priority ${expectedRule.Priority}) forward action missing target group: ${expectedTg.targetGroupName}`,
                );
              }

              if (actualTg.Weight !== expectedTg.Weight) {
                throw new TransactionError(
                  `ALB Listener rule (priority ${expectedRule.Priority}) forward action target group ${expectedTg.targetGroupName} weight mismatch. Expected: ${expectedTg.Weight}, Actual: ${actualTg.Weight}`,
                );
              }
            }

            // Validate stickiness config.
            if (expectedAction.action.TargetGroupStickinessConfig) {
              if (!actualAction.ForwardConfig?.TargetGroupStickinessConfig) {
                throw new TransactionError(
                  `ALB Listener rule (priority ${expectedRule.Priority}) forward action missing stickiness configuration`,
                );
              }

              if (
                actualAction.ForwardConfig.TargetGroupStickinessConfig.Enabled !==
                expectedAction.action.TargetGroupStickinessConfig.Enabled
              ) {
                throw new TransactionError(
                  `ALB Listener rule (priority ${expectedRule.Priority}) forward action stickiness enabled mismatch. Expected: ${expectedAction.action.TargetGroupStickinessConfig.Enabled}, Actual: ${actualAction.ForwardConfig.TargetGroupStickinessConfig.Enabled}`,
                );
              }

              if (
                actualAction.ForwardConfig.TargetGroupStickinessConfig.DurationSeconds !==
                expectedAction.action.TargetGroupStickinessConfig.DurationSeconds
              ) {
                throw new TransactionError(
                  `ALB Listener rule (priority ${expectedRule.Priority}) forward action stickiness duration mismatch. Expected: ${expectedAction.action.TargetGroupStickinessConfig.DurationSeconds}, Actual: ${actualAction.ForwardConfig.TargetGroupStickinessConfig.DurationSeconds}`,
                );
              }
            }
          } else if (expectedAction.actionType === 'redirect') {
            const actualAction = actualActions.find((a) => a.Type === 'redirect');
            if (!actualAction) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) missing redirect action`,
              );
            }

            const expectedRedirect = expectedAction.action;
            const actualRedirect = actualAction.RedirectConfig;

            if (actualRedirect?.Host !== (expectedRedirect.Host ?? undefined)) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) redirect host mismatch. Expected: ${expectedRedirect.Host}, Actual: ${actualRedirect?.Host}`,
              );
            }

            if (actualRedirect?.Path !== (expectedRedirect.Path ?? undefined)) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) redirect path mismatch. Expected: ${expectedRedirect.Path}, Actual: ${actualRedirect?.Path}`,
              );
            }

            if (actualRedirect?.Port !== (expectedRedirect.Port ? String(expectedRedirect.Port) : undefined)) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) redirect port mismatch. Expected: ${expectedRedirect.Port}, Actual: ${actualRedirect?.Port}`,
              );
            }

            if (actualRedirect?.Protocol !== (expectedRedirect.Protocol ?? undefined)) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) redirect protocol mismatch. Expected: ${expectedRedirect.Protocol}, Actual: ${actualRedirect?.Protocol}`,
              );
            }

            if (actualRedirect?.Query !== (expectedRedirect.Query ?? undefined)) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) redirect query mismatch. Expected: ${expectedRedirect.Query}, Actual: ${actualRedirect?.Query}`,
              );
            }

            const expectedStatusCode = expectedRedirect.StatusCode ? `HTTP_${expectedRedirect.StatusCode}` : undefined;
            if (actualRedirect?.StatusCode !== expectedStatusCode) {
              throw new TransactionError(
                `ALB Listener rule (priority ${expectedRule.Priority}) redirect status code mismatch. Expected: ${expectedStatusCode}, Actual: ${actualRedirect?.StatusCode}`,
              );
            }
          }
        }
      }
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateAlbListenerResourceAction>(ValidateAlbListenerResourceAction)
export class ValidateAlbListenerResourceActionFactory {
  private static instance: ValidateAlbListenerResourceAction;

  static async create(): Promise<ValidateAlbListenerResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateAlbListenerResourceAction();
    }
    return this.instance;
  }
}
