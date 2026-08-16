import type { UnknownNode } from '../../app.type.js';
import { DependencyError } from '../../errors/index.js';
import type { DiffAction } from '../diff/diff.js';

/**
 * @internal
 */
class DependencyBehavior {
  forAction: DiffAction;

  onAction: DiffAction;

  onField: string;

  toField: string;

  /**
   * @internal
   */
  constructor(onField: string, onAction: DiffAction, toField: string, forAction: DiffAction) {
    this.onField = onField;
    this.onAction = onAction;
    this.toField = toField;
    this.forAction = forAction;
  }
}

/**
 * How two nodes are related. A parent exists before its child, and outlives it.
 *
 * @group Functions/Dependency
 */
export enum DependencyRelationship {
  CHILD = 'child',
  PARENT = 'parent',
}

/**
 * The serialized form of a {@link Dependency}, as it is written to state.
 *
 * @group Functions/Dependency
 */
export interface IDependency {
  behaviors: {
    forAction: DependencyBehavior['forAction'];
    onAction: DependencyBehavior['onAction'];
    onField: DependencyBehavior['onField'];
    toField: DependencyBehavior['toField'];
  }[];

  from: string;

  relationship?: {
    onField: DependencyBehavior['onField'];
    toField: DependencyBehavior['toField'];
    type: DependencyRelationship;
  };

  to: string;
}

/**
 * The edge between two nodes in Octo's graph.
 *
 * A dependency is directed, and carries two things: an optional parent/child relationship, and a set
 * of *behaviors*. A behavior states an ordering rule - "when this field of `from` is added, the
 * matching action on `to` must have run first" - and it is those rules that let Octo order a
 * transaction correctly instead of guessing.
 *
 * Models create dependencies through `addChild()` and `addRelationship()`; you rarely construct one.
 *
 * @group Functions/Dependency
 *
 * @see Definition of [Dependencies](/docs/fundamentals/dependencies).
 */
export class Dependency {
  /**
   * The node this dependency points from.
   */
  readonly from: UnknownNode;

  /**
   * The node this dependency points to.
   */
  readonly to: UnknownNode;

  private readonly behaviors: DependencyBehavior[] = [];

  private relationship: { onField: string; toField: string; type: DependencyRelationship };

  /**
   * @param from The node this dependency points from.
   * @param to The node this dependency points to.
   */
  constructor(from: UnknownNode, to: UnknownNode) {
    this.from = from;
    this.to = to;
  }

  /**
   * @internal
   */
  static unSynth(from: UnknownNode, to: UnknownNode, dependency: IDependency): Dependency {
    const newDependency = new Dependency(from, to);

    dependency.behaviors.forEach((b) => {
      newDependency.addBehavior(b.onField, b.onAction, b.toField, b.forAction);
    });

    if (dependency.relationship) {
      newDependency.relationship = { ...dependency.relationship };
    }

    return newDependency;
  }

  /**
   * To declare an ordering rule: when `onAction` happens to `onField` of `from`, then `forAction`
   * on `toField` of `to` must have been applied first. Adding the same behavior twice is a no-op.
   */
  addBehavior(onField: string, onAction: DiffAction, toField: string, forAction: DiffAction): void {
    if (this.getBehaviorIndex(onField, onAction, toField, forAction) === -1) {
      this.behaviors.push(new DependencyBehavior(onField, onAction, toField, forAction));
    }
  }

  /**
   * To mark `to` as the child of `from`.
   *
   * @throws {@link DependencyError} If this dependency already has a relationship.
   */
  addChildRelationship(onField: string, toField: string): void {
    if (this.relationship) {
      throw new DependencyError('Dependency relationship already exists!', this);
    }
    this.relationship = { onField, toField, type: DependencyRelationship.CHILD };
  }

  /**
   * To mark `to` as the parent of `from`.
   *
   * @throws {@link DependencyError} If this dependency already has a relationship.
   */
  addParentRelationship(onField: string, toField: string): void {
    if (this.relationship) {
      throw new DependencyError('Dependency relationship already exists!', this);
    }
    this.relationship = { onField, toField, type: DependencyRelationship.PARENT };
  }

  /**
   * The relationship between the two nodes, if one was declared.
   */
  getRelationship(): { onField: string; toField: string; type: DependencyRelationship } | undefined {
    return this.relationship;
  }

  /**
   * Whether any behavior matches every argument given. Arguments left out match anything.
   */
  hasMatchingBehavior(onField?: string, onAction?: DiffAction, toField?: string, forAction?: DiffAction): boolean {
    return this.behaviors.some((b) => {
      const onFieldCondition = onField ? b.onField === onField : true;
      const onActionCondition = onAction ? b.onAction === onAction : true;
      const toFieldCondition = toField ? b.toField === toField : true;
      const forActionCondition = forAction ? b.forAction === forAction : true;
      return onFieldCondition && onActionCondition && toFieldCondition && forActionCondition;
    });
  }

  /**
   * Whether `to` is a child of `from`.
   */
  isChildRelationship(): boolean {
    return this.relationship && this.relationship.type === DependencyRelationship.CHILD;
  }

  /**
   * Whether both dependencies connect the same two nodes, in the same direction.
   */
  isEqual(dependency: Dependency): boolean {
    return (
      this.from.getContext() === dependency.from.getContext() && this.to.getContext() === dependency.to.getContext()
    );
  }

  /**
   * Whether `to` is a parent of `from`.
   */
  isParentRelationship(): boolean {
    return this.relationship && this.relationship.type === DependencyRelationship.PARENT;
  }

  /**
   * To drop an ordering rule.
   *
   * @throws {@link DependencyError} If no such behavior exists.
   */
  removeBehavior(onField: string, onAction: DiffAction, toField: string, forAction: DiffAction): void {
    const index = this.getBehaviorIndex(onField, onAction, toField, forAction);
    if (index === -1) {
      throw new DependencyError('Dependency behavior not found!', this);
    }

    this.behaviors.splice(index, 1);
  }

  /**
   * @internal
   */
  synth(): IDependency {
    const behaviors: IDependency['behaviors'] = [];
    this.behaviors.forEach((b) => {
      behaviors.push({
        forAction: b.forAction,
        onAction: b.onAction,
        onField: b.onField,
        toField: b.toField,
      });
    });

    return {
      behaviors,
      from: this.from.getContext(),
      relationship: this.relationship
        ? {
            onField: this.relationship.onField,
            toField: this.relationship.toField,
            type: this.relationship.type,
          }
        : undefined,
      to: this.to.getContext(),
    };
  }

  /**
   * The position of a matching behavior, or `-1`.
   */
  private getBehaviorIndex(onField: string, onAction: DiffAction, toField: string, forAction: DiffAction): number {
    return this.behaviors.findIndex(
      (b) => b.onField === onField && b.onAction === onAction && b.toField === toField && b.forAction === forAction,
    );
  }
}
