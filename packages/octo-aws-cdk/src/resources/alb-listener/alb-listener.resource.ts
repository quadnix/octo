import { AResource, Diff, DiffAction, DiffUtility, type MatchingResource, Resource } from '@quadnix/octo';
import type { AlbSchema } from '../alb/index.schema.js';
import type { AlbTargetGroupSchema } from '../alb-target-group/index.schema.js';
import { AlbListenerSchema } from './index.schema.js';

export type IAlbListenerAddRuleDiff = {
  action: 'add';
  rule: AlbListenerSchema['properties']['rules'][0];
};
export type IAlbListenerDeleteRuleDiff = {
  action: 'delete';
  rule: AlbListenerSchema['properties']['rules'][0];
  RuleArn: string;
};
export type IAlbListenerUpdateRuleDiff = {
  action: 'update';
  rule: AlbListenerSchema['properties']['rules'][0];
  RuleArn: string;
};
export type IAlbListenerRuleDiff = IAlbListenerAddRuleDiff | IAlbListenerDeleteRuleDiff | IAlbListenerUpdateRuleDiff;

export function isAddRuleDiff(ruleDiff: IAlbListenerRuleDiff): ruleDiff is IAlbListenerAddRuleDiff {
  return ruleDiff.action === 'add';
}

export function isDeleteRuleDiff(ruleDiff: IAlbListenerRuleDiff): ruleDiff is IAlbListenerDeleteRuleDiff {
  return ruleDiff.action === 'delete';
}

export function isUpdateRuleDiff(ruleDiff: IAlbListenerRuleDiff): ruleDiff is IAlbListenerUpdateRuleDiff {
  return ruleDiff.action === 'update';
}

export type IAlbListenerPropertiesDiff = {
  DefaultActions?: [];
  Rule?: IAlbListenerRuleDiff;
};

export function isAlbListenerPropertiesDefaultActionsDiff(
  propertiesDiff: IAlbListenerPropertiesDiff,
): propertiesDiff is { DefaultActions: [] } {
  return Object.keys(propertiesDiff).includes('DefaultActions');
}

export function isAlbListenerPropertiesRuleDiff(
  propertiesDiff: IAlbListenerPropertiesDiff,
): propertiesDiff is { Rule: IAlbListenerRuleDiff } {
  return Object.keys(propertiesDiff).includes('Rule');
}

/**
 * @group Resources/AlbListener
 */
@Resource<AlbListener>('@octo', 'alb-listener', AlbListenerSchema)
export class AlbListener extends AResource<AlbListenerSchema, AlbListener> {
  declare parents: [MatchingResource<AlbSchema>, ...MatchingResource<AlbTargetGroupSchema>[]];
  declare properties: AlbListenerSchema['properties'];
  declare response: AlbListenerSchema['response'];

  constructor(
    resourceId: string,
    properties: AlbListenerSchema['properties'],
    parents: [MatchingResource<AlbSchema>, ...MatchingResource<AlbTargetGroupSchema>[]],
  ) {
    const albTargetGroupMatchingParents = parents.filter(
      (p) => (p.getActual().constructor as typeof AResource).NODE_NAME === 'alb-target-group',
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
        throw new Error(`Invalid "forward" configuration! TargetGroup "${targetGroupName}" not found in parents!`);
      }
    }

    // There should not be a target group which is not referenced by a "forward" action.
    if (albTargetGroupNames.length !== albTargetGroupParentNames.length) {
      throw new Error('Invalid "forward" configuration! Forward configurations does not match parents!');
    }

    // All rules have a unique priority.
    const priorities = new Set(properties.rules.map((r) => r.Priority));
    if (priorities.size !== properties.rules.length) {
      throw new Error('Rules have duplicate priorities!');
    }

    super(resourceId, properties, parents);
  }

  override async diffInverse(
    diff: Diff,
    deReferenceResource: (
      resourceId: string,
    ) => Promise<AResource<AlbSchema, any> | AResource<AlbTargetGroupSchema, any>>,
  ): Promise<void> {
    if (
      diff.action === DiffAction.UPDATE &&
      diff.field === 'properties' &&
      isAlbListenerPropertiesDefaultActionsDiff(diff.value as IAlbListenerPropertiesDiff)
    ) {
      this.properties.DefaultActions = JSON.parse(
        JSON.stringify((diff.node as AResource<AlbListenerSchema, any>).properties.DefaultActions),
      );
    } else if (
      diff.action === DiffAction.UPDATE &&
      diff.field === 'properties' &&
      isAlbListenerPropertiesRuleDiff(diff.value as IAlbListenerPropertiesDiff)
    ) {
      const rule = (diff.value as { Rule: IAlbListenerRuleDiff }).Rule;

      if (isAddRuleDiff(rule)) {
        this.properties.rules.push(JSON.parse(JSON.stringify(rule.rule)));
      } else if (isDeleteRuleDiff(rule)) {
        this.properties.rules.splice(
          this.properties.rules.findIndex((r) => r.Priority === rule.rule.Priority),
          1,
        );
      } else if (isUpdateRuleDiff(rule)) {
        this.properties.rules.splice(
          this.properties.rules.findIndex((r) => r.Priority === rule.rule.Priority),
          1,
          JSON.parse(JSON.stringify(rule.rule)),
        );
      }

      this.cloneResponseInPlace(diff.node as AlbListener);
    } else {
      return super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: AlbListener): Promise<Diff[]> {
    const diffs: Diff[] = [];

    // Diff DefaultActions.
    if (!DiffUtility.isObjectDeepEquals(previous.properties.DefaultActions, this.properties.DefaultActions)) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'properties', { DefaultActions: [] }));
    }

    // Diff rules.
    for (const previousRule of previous.properties.rules) {
      const currentRule = this.properties.rules.find((r) => r.Priority === previousRule.Priority);
      const previousRuleResponse = previous.response.Rules!.find((r) => r.Priority === previousRule.Priority)!;

      if (!currentRule) {
        const deleteRuleDiff: IAlbListenerDeleteRuleDiff = {
          action: 'delete',
          rule: previousRule,
          RuleArn: previousRuleResponse.RuleArn,
        };
        diffs.push(
          new Diff(this, DiffAction.UPDATE, 'properties', {
            Rule: deleteRuleDiff,
          }),
        );
      } else if (!DiffUtility.isObjectDeepEquals(previousRule, currentRule)) {
        const updateRuleDiff: IAlbListenerUpdateRuleDiff = {
          action: 'update',
          rule: currentRule,
          RuleArn: previousRuleResponse.RuleArn,
        };
        diffs.push(
          new Diff(this, DiffAction.UPDATE, 'properties', {
            Rule: updateRuleDiff,
          }),
        );
      }
    }
    for (const currentRule of this.properties.rules) {
      if (!previous.properties.rules.find((r) => r.Priority === currentRule.Priority)) {
        const addRuleDiff: IAlbListenerAddRuleDiff = { action: 'add', rule: currentRule };
        diffs.push(new Diff(this, DiffAction.UPDATE, 'properties', { Rule: addRuleDiff }));
      }
    }

    return diffs;
  }

  override diffUnpack(diff: Diff): Diff[] {
    if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      const diffs: Diff[] = [diff];

      diffs.push(new Diff(this, DiffAction.UPDATE, 'properties', { DefaultActions: [] }));

      return diffs;
    } else {
      return [diff];
    }
  }
}
