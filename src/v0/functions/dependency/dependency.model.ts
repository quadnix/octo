import { Model } from '../../models/model.abstract';
import { DiffAction } from '../diff/diff.model';

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

export class Dependency {
  private readonly behaviors: DependencyBehavior[] = [];

  readonly from: Model<unknown, unknown>;

  readonly to: Model<unknown, unknown>;

  private relationship: { onField: string; toField: string; type: DependencyRelationship };

  constructor(from: Model<unknown, unknown>, to: Model<unknown, unknown>) {
    this.from = from;
    this.to = to;
  }

  private getBehaviorIndex(onField: string, onAction: DiffAction, toField: string, forAction: DiffAction): number {
    return this.behaviors.findIndex(
      (b) => b.onField === onField && b.onAction === onAction && b.toField === toField && b.forAction === forAction,
    );
  }

  addBehavior(onField: string, onAction: DiffAction, toField: string, forAction: DiffAction): void {
    if (!this.from.hasOwnProperty(onField) || !this.to.hasOwnProperty(toField)) {
      throw new Error('Invalid field name is not a property of given model!');
    }

    if (this.getBehaviorIndex(onField, onAction, toField, forAction) === -1) {
      this.behaviors.push(new DependencyBehavior(onField, onAction, toField, forAction));
    }
  }

  addChildRelationship(onField: string, toField: string): void {
    if (this.relationship) {
      throw new Error('Dependency relationship already exists!');
    }
    this.relationship = { onField, toField, type: DependencyRelationship.CHILD };
  }

  addParentRelationship(onField: string, toField: string): void {
    if (this.relationship) {
      throw new Error('Dependency relationship already exists!');
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

  isParentRelationship(): boolean {
    return this.relationship && this.relationship.type === DependencyRelationship.PARENT;
  }

  getRelationship(): { onField: string; toField: string; type: DependencyRelationship } | undefined {
    return this.relationship;
  }

  removeBehavior(onField: string, onAction: DiffAction, toField: string, forAction: DiffAction): void {
    const index = this.getBehaviorIndex(onField, onAction, toField, forAction);
    if (index === -1) {
      throw new Error('Dependency behavior not found!');
    }

    this.behaviors.splice(index, 1);
  }
}
