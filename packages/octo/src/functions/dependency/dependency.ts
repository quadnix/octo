import type { UnknownNode } from '../../app.type.js';
import { DependencyError } from '../../errors/index.js';
import type { DiffAction } from '../diff/diff.js';

class DependencyBehavior {
  forAction: DiffAction;

  onAction: DiffAction;

  onField: string;

  toField: string;

  constructor(onField: string, onAction: DiffAction, toField: string, forAction: DiffAction) {
    this.onField = onField;
    this.onAction = onAction;
    this.toField = toField;
    this.forAction = forAction;
  }
}

export enum DependencyRelationship {
  CHILD = 'child',
  PARENT = 'parent',
}

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

export class Dependency {
  private readonly behaviors: DependencyBehavior[] = [];

  readonly from: UnknownNode;

  private relationship: { onField: string; toField: string; type: DependencyRelationship };

  readonly to: UnknownNode;

  constructor(from: UnknownNode, to: UnknownNode) {
    this.from = from;
    this.to = to;
  }

  private getBehaviorIndex(onField: string, onAction: DiffAction, toField: string, forAction: DiffAction): number {
    return this.behaviors.findIndex(
      (b) => b.onField === onField && b.onAction === onAction && b.toField === toField && b.forAction === forAction,
    );
  }

  addBehavior(onField: string, onAction: DiffAction, toField: string, forAction: DiffAction): void {
    if (this.getBehaviorIndex(onField, onAction, toField, forAction) === -1) {
      this.behaviors.push(new DependencyBehavior(onField, onAction, toField, forAction));
    }
  }

  addChildRelationship(onField: string, toField: string): void {
    if (this.relationship) {
      throw new DependencyError('Dependency relationship already exists!', this);
    }
    this.relationship = { onField, toField, type: DependencyRelationship.CHILD };
  }

  addParentRelationship(onField: string, toField: string): void {
    if (this.relationship) {
      throw new DependencyError('Dependency relationship already exists!', this);
    }
    this.relationship = { onField, toField, type: DependencyRelationship.PARENT };
  }

  hasMatchingBehavior(onField?: string, onAction?: DiffAction, toField?: string, forAction?: DiffAction): boolean {
    return this.behaviors.some((b) => {
      const onFieldCondition = onField ? b.onField === onField : true;
      const onActionCondition = onAction ? b.onAction === onAction : true;
      const toFieldCondition = toField ? b.toField === toField : true;
      const forActionCondition = forAction ? b.forAction === forAction : true;
      return onFieldCondition && onActionCondition && toFieldCondition && forActionCondition;
    });
  }

  isChildRelationship(): boolean {
    return this.relationship && this.relationship.type === DependencyRelationship.CHILD;
  }

  isEqual(dependency: Dependency): boolean {
    return (
      this.from.getContext() === dependency.from.getContext() && this.to.getContext() === dependency.to.getContext()
    );
  }

  isParentRelationship(): boolean {
    return this.relationship && this.relationship.type === DependencyRelationship.PARENT;
  }

  getRelationship(): { onField: string; toField: string; type: DependencyRelationship } | undefined {
    return this.relationship;
  }

  removeBehavior(onField: string, onAction: DiffAction, toField: string, forAction: DiffAction): void {
    const index = this.getBehaviorIndex(onField, onAction, toField, forAction);
    if (index === -1) {
      throw new DependencyError('Dependency behavior not found!', this);
    }

    this.behaviors.splice(index, 1);
  }

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
}
