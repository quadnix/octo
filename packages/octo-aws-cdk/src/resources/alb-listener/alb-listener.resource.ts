import {
  AResource,
  ATerraformResource,
  DependencyRelationship,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  ResourceError,
  type TerraformModuleScope,
  hasNodeName,
} from '@quadnix/octo';
import type { AlbSchema } from '../alb/index.schema.js';
import type { AlbTargetGroupSchema } from '../alb-target-group/index.schema.js';
import { AlbListenerSchema, type IAlbListenerActionTypes, type IAlbListenerRuleTypes } from './index.schema.js';

/**
 * @internal
 */
export type IAlbListenerAddRuleDiff = {
  action: 'add';
  rule: AlbListenerSchema['properties']['rules'][0];
};
/**
 * @internal
 */
export type IAlbListenerDeleteRuleDiff = {
  action: 'delete';
  rule: AlbListenerSchema['properties']['rules'][0];
};
/**
 * @internal
 */
export type IAlbListenerUpdateRuleDiff = {
  action: 'update';
  rule: AlbListenerSchema['properties']['rules'][0];
};
/**
 * @internal
 */
export type IAlbListenerRuleDiff = IAlbListenerAddRuleDiff | IAlbListenerDeleteRuleDiff | IAlbListenerUpdateRuleDiff;

/**
 * @internal
 */
export function isAddRuleDiff(ruleDiff: IAlbListenerRuleDiff): ruleDiff is IAlbListenerAddRuleDiff {
  return ruleDiff.action === 'add';
}

/**
 * @internal
 */
export function isDeleteRuleDiff(ruleDiff: IAlbListenerRuleDiff): ruleDiff is IAlbListenerDeleteRuleDiff {
  return ruleDiff.action === 'delete';
}

/**
 * @internal
 */
export function isUpdateRuleDiff(ruleDiff: IAlbListenerRuleDiff): ruleDiff is IAlbListenerUpdateRuleDiff {
  return ruleDiff.action === 'update';
}

/**
 * @internal
 */
export type IAlbListenerPropertiesDiff = {
  DefaultActions?: [];
  Rule?: IAlbListenerRuleDiff;
};

/**
 * @internal
 */
export function isAlbListenerPropertiesDefaultActionsDiff(
  propertiesDiff: IAlbListenerPropertiesDiff,
): propertiesDiff is { DefaultActions: [] } {
  return Object.keys(propertiesDiff).includes('DefaultActions');
}

/**
 * @internal
 */
export function isAlbListenerPropertiesRuleDiff(
  propertiesDiff: IAlbListenerPropertiesDiff,
): propertiesDiff is { Rule: IAlbListenerRuleDiff } {
  return Object.keys(propertiesDiff).includes('Rule');
}

/**
 * @internal
 */
@Resource<AlbListener>('@octo', 'alb-listener', AlbListenerSchema)
export class AlbListener extends ATerraformResource<AlbListenerSchema, AlbListener> {
  declare parents: [MatchingResource<AlbSchema>, ...MatchingResource<AlbTargetGroupSchema>[]];
  declare properties: AlbListenerSchema['properties'];
  declare response: AlbListenerSchema['response'];

  constructor(
    resourceId: string,
    properties: AlbListenerSchema['properties'],
    parents: [MatchingResource<AlbSchema>, ...MatchingResource<AlbTargetGroupSchema>[]],
  ) {
    super(resourceId, properties, parents);

    const albTargetGroupMatchingParents = parents.filter((p) =>
      hasNodeName(p.getActual(), 'alb-target-group'),
    ) as MatchingResource<AlbTargetGroupSchema>[];
    const albTargetGroupParentNames = albTargetGroupMatchingParents
      .map((p) => p.getSchemaInstance().properties.Name)
      .sort();
    const albTargetGroupNames = Array.from(
      new Set(
        [
          ...properties.DefaultActions.filter((a) => a.actionType === 'forward')
            .map((a) => a.action.TargetGroups.map((t) => t.targetGroupName))
            .flat(),
          ...properties.rules
            .map((r) => r.actions)
            .flat()
            .filter((a) => a.actionType === 'forward')
            .map((a) => a.action)
            .map((a) => a.TargetGroups.map((t) => t.targetGroupName))
            .flat(),
        ].sort(),
      ),
    );

    // "Forward" actions have an associated target group.
    for (const targetGroupName of albTargetGroupNames) {
      if (!albTargetGroupParentNames.includes(targetGroupName)) {
        throw new ResourceError(
          `Invalid "forward" configuration! TargetGroup "${targetGroupName}" not found in parents!`,
          this,
        );
      }
    }

    // There should not be a target group which is not referenced by a "forward" action.
    if (albTargetGroupNames.length !== albTargetGroupParentNames.length) {
      throw new ResourceError('Invalid "forward" configuration! Forward configurations does not match parents!', this);
    }

    // All rules have a unique priority.
    const priorities = new Set(properties.rules.map((r) => r.Priority));
    if (priorities.size !== properties.rules.length) {
      throw new ResourceError('Rules have duplicate priorities!', this);
    }

    this.updateListenerAlbTargetGroups(albTargetGroupMatchingParents);
  }

  override async diff(previous: AlbListener): Promise<Diff[]> {
    const diffs: Diff[] = await super.diff(previous);

    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && hasNodeName(diffs[i].value as AResource<any, any>, 'alb')) {
        // If the ALB parent has changed, there is no need to process this diff,
        // since the ALB Arn is still the same.
        diffs.splice(i, 1);
      } else if (
        diffs[i].field === 'parent' &&
        hasNodeName(diffs[i].value as AResource<any, any>, 'alb-target-group')
      ) {
        // If the ALB Target Group parent has changed, there is no need to process this diff,
        // since we have already verified in constructor that this target group is not referenced in listener.
        // The target group is managed separately in its own actions.
        diffs.splice(i, 1);
      }
    }

    return diffs;
  }

  override async diffProperties(previous: AlbListener): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (
      !DiffUtility.isObjectDeepEquals(previous.properties, this.properties, [
        'DefaultActions',
        'Port',
        'Protocol',
        'rules',
      ])
    ) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'alb listener identity (account/region) changed; a change recreates it',
        ),
      ];
    }

    // Diff DefaultActions, Port, or Protocols.
    if (
      !DiffUtility.isObjectDeepEquals(previous.properties.DefaultActions, this.properties.DefaultActions) ||
      previous.properties.Port !== this.properties.Port ||
      previous.properties.Protocol !== this.properties.Protocol
    ) {
      diffs.push(
        new Diff<any, IAlbListenerPropertiesDiff>(this, DiffAction.UPDATE, 'properties', { DefaultActions: [] }),
      );
    }

    // Diff rules.
    for (const previousRule of previous.properties.rules) {
      const currentRule = this.properties.rules.find((r) => r.Priority === previousRule.Priority);

      if (!currentRule) {
        const deleteRuleDiff: IAlbListenerDeleteRuleDiff = {
          action: 'delete',
          rule: previousRule,
        };
        diffs.push(
          new Diff<any, IAlbListenerPropertiesDiff>(this, DiffAction.UPDATE, 'properties', {
            Rule: deleteRuleDiff,
          }),
        );
      } else if (!DiffUtility.isObjectDeepEquals(previousRule, currentRule)) {
        const updateRuleDiff: IAlbListenerUpdateRuleDiff = {
          action: 'update',
          rule: currentRule,
        };
        diffs.push(
          new Diff<any, IAlbListenerPropertiesDiff>(this, DiffAction.UPDATE, 'properties', {
            Rule: updateRuleDiff,
          }),
        );
      }
    }
    for (const currentRule of this.properties.rules) {
      if (!previous.properties.rules.find((r) => r.Priority === currentRule.Priority)) {
        const addRuleDiff: IAlbListenerAddRuleDiff = { action: 'add', rule: currentRule };
        diffs.push(
          new Diff<any, IAlbListenerPropertiesDiff>(this, DiffAction.UPDATE, 'properties', { Rule: addRuleDiff }),
        );
      }
    }

    return diffs;
  }

  override diffUnpack(diff: Diff): Diff[] {
    if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      const diffs: Diff[] = [diff];

      diffs.push(
        new Diff<any, IAlbListenerPropertiesDiff>(this, DiffAction.UPDATE, 'properties', { DefaultActions: [] }),
      );

      for (const rule of this.properties.rules) {
        const addRuleDiff: IAlbListenerAddRuleDiff = { action: 'add', rule };
        diffs.push(
          new Diff<any, IAlbListenerPropertiesDiff>(this, DiffAction.UPDATE, 'properties', { Rule: addRuleDiff }),
        );
      }

      return diffs;
    } else {
      return [diff];
    }
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const targetGroupParents = (this.parents as MatchingResource<AlbTargetGroupSchema>[]).filter((p) =>
      hasNodeName(p.getActual(), 'alb-target-group'),
    );

    const buildActionSpec = (action: {
      action: IAlbListenerActionTypes[keyof IAlbListenerActionTypes];
      actionType: keyof IAlbListenerActionTypes;
    }): Record<string, unknown> => {
      if (action.actionType === 'fixed-response') {
        const a = action.action as IAlbListenerActionTypes['fixed-response'];
        return {
          fixed_response: {
            content_type: a.ContentType,
            message_body: a.MessageBody,
            status_code: String(a.StatusCode),
          },
          type: 'fixed-response',
        };
      } else if (action.actionType === 'forward') {
        const a = action.action as IAlbListenerActionTypes['forward'];
        const forwardSpec: Record<string, unknown> = {
          target_group: a.TargetGroups.map((tg) => {
            const tgParent = targetGroupParents.find(
              (p) => p.getSchemaInstance().properties.Name === tg.targetGroupName,
            )!;
            return {
              arn: terraform.getRef(tgParent, 'TargetGroupArn'),
              weight: tg.Weight,
            };
          }),
        };
        if (a.TargetGroupStickinessConfig) {
          forwardSpec['stickiness'] = {
            duration: a.TargetGroupStickinessConfig.DurationSeconds,
            enabled: a.TargetGroupStickinessConfig.Enabled,
          };
        }
        return { forward: forwardSpec, type: 'forward' };
      } else {
        const a = action.action as IAlbListenerActionTypes['redirect'];
        const redirectSpec: Record<string, unknown> = {
          ...(a.Host ? { host: a.Host } : {}),
          ...(a.Path ? { path: a.Path } : {}),
          ...(a.Port ? { port: String(a.Port) } : {}),
          ...(a.Protocol ? { protocol: a.Protocol } : {}),
          ...(a.Query ? { query: a.Query } : {}),
          status_code: `HTTP_${a.StatusCode}`,
        };
        return { redirect: redirectSpec, type: 'redirect' };
      }
    };

    const buildConditionSpec = (condition: {
      condition: IAlbListenerRuleTypes[keyof IAlbListenerRuleTypes];
      conditionType: keyof IAlbListenerRuleTypes;
    }): Record<string, unknown> => {
      if (condition.conditionType === 'host-header') {
        return { host_header: { values: (condition.condition as IAlbListenerRuleTypes['host-header']).Values } };
      } else if (condition.conditionType === 'http-header') {
        const c = condition.condition as IAlbListenerRuleTypes['http-header'];
        return { http_header: { http_header_name: c.HttpHeaderName, values: c.Values } };
      } else if (condition.conditionType === 'http-request-method') {
        return {
          http_request_method: { values: (condition.condition as IAlbListenerRuleTypes['http-request-method']).Values },
        };
      } else if (condition.conditionType === 'path-pattern') {
        return { path_pattern: { values: (condition.condition as IAlbListenerRuleTypes['path-pattern']).Values } };
      } else if (condition.conditionType === 'query-string') {
        const c = condition.condition as IAlbListenerRuleTypes['query-string'];
        return { query_string: c.Values.map((v) => ({ key: v.Key, value: v.Value })) };
      } else {
        return { source_ip: { values: (condition.condition as IAlbListenerRuleTypes['source-ip']).Values } };
      }
    };

    const albListenerOctoResource = terraform.addOctoTerraformResource(this as AlbListener, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const listenerTFResource = albListenerOctoResource.addTerraformResource('aws_lb_listener', this.resourceId, {
      default_action: buildActionSpec(this.properties.DefaultActions[0]),
      load_balancer_arn: terraform.getRef(this.parents[0], 'LoadBalancerArn'),
      port: this.properties.Port,
      protocol: this.properties.Protocol,
    });
    albListenerOctoResource.output({
      ListenerArn: terraform.raw(`${listenerTFResource.address}.arn`),
    });

    for (const rule of this.properties.rules) {
      albListenerOctoResource.addTerraformResource('aws_lb_listener_rule', `${this.resourceId}_rule_${rule.Priority}`, {
        action: rule.actions.map((a) => buildActionSpec(a)),
        condition: rule.conditions.map((c) => buildConditionSpec(c)),
        listener_arn: terraform.raw(`${listenerTFResource.address}.arn`),
        priority: rule.Priority,
      });
    }

    if (Object.keys(this.tags).length > 0) {
      listenerTFResource.attribute('tags', this.tags);
    }
  }

  private updateListenerAlbTargetGroups(albTargetGroupMatchingParents: MatchingResource<AlbTargetGroupSchema>[]): void {
    for (const albTargetGroupParent of albTargetGroupMatchingParents) {
      const listenerToAlbTargetGroupDep = this.getDependency(
        albTargetGroupParent.getActual(),
        DependencyRelationship.CHILD,
      )!;
      const albTargetGroupToListenerDep = albTargetGroupParent
        .getActual()
        .getDependency(this, DependencyRelationship.PARENT)!;

      // Before updating alb-listener must add alb-target-group.
      listenerToAlbTargetGroupDep.addBehavior('properties', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
      // Before deleting alb-target-group must update  alb-listener.
      albTargetGroupToListenerDep.addBehavior('resourceId', DiffAction.DELETE, 'properties', DiffAction.UPDATE);
    }
  }
}
