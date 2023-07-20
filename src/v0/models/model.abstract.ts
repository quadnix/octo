import { Dependency } from '../functions/dependency/dependency.model';
import { Diff, DiffAction } from '../functions/diff/diff.model';
import { DiffUtility } from '../functions/diff/diff.utility';
import { IModel } from './model.interface';

/**
 * This is the first implementation of the Model's interface,
 * and is used to define common functionality between all models.
 * All models are an extension of this class.
 */
export abstract class Model<I, T> implements IModel<I, T> {
  abstract readonly MODEL_NAME: string;

  protected readonly dependencies: Dependency[] = [];

  addChild(onField: keyof T, child: Model<unknown, unknown>, toField: string): void {
    // Check if child already has a dependency to self.
    const cIndex = child.dependencies.findIndex((d) => Object.is(d.to, this));
    const childToParentDependency = cIndex === -1 ? new Dependency(child, this) : child.dependencies[cIndex];
    childToParentDependency.addBehavior(toField, DiffAction.ADD, onField as string, DiffAction.ADD);
    childToParentDependency.addBehavior(toField, DiffAction.ADD, onField as string, DiffAction.UPDATE);
    if (cIndex === -1) {
      childToParentDependency.addChildRelationship(toField, onField as string);
      child.dependencies.push(childToParentDependency);
    }

    // Check if parent already has a dependency to child.
    const pIndex = this.dependencies.findIndex((d) => Object.is(d.to, child));
    const parentToChildDependency = pIndex === -1 ? new Dependency(this, child) : this.dependencies[pIndex];
    parentToChildDependency.addBehavior(onField as string, DiffAction.DELETE, toField, DiffAction.DELETE);
    if (pIndex === -1) {
      parentToChildDependency.addParentRelationship(onField as string, toField);
      this.dependencies.push(parentToChildDependency);
    }
  }

  diff(previous?: T): Diff[] {
    const childrenByModel = this.getChildren();
    const childrenOfPreviousByModel = (previous as Model<unknown, unknown>)?.getChildren() ?? {};

    const diffs: Diff[] = [];
    const modelsSeen: string[] = [];

    for (const modelName of Object.keys(childrenByModel)) {
      const children = childrenByModel[modelName].map((d) => d.to);
      const childrenOfPrevious = childrenOfPreviousByModel[modelName]?.map((d) => d.to) ?? [];
      const field = childrenByModel[modelName][0].getRelationship()!.toField;
      diffs.push(...DiffUtility.diffModels(childrenOfPrevious, children, field as string));

      modelsSeen.push(modelName);
    }

    for (const modelName of Object.keys(childrenOfPreviousByModel)) {
      if (modelsSeen.indexOf(modelName) !== -1) {
        continue;
      }

      const children = [];
      const childrenOfPrevious = childrenOfPreviousByModel[modelName].map((d) => d.to);
      const field = childrenOfPreviousByModel[modelName][0].getRelationship()!.toField;
      diffs.push(...DiffUtility.diffModels(childrenOfPrevious, children, field as string));
    }

    return diffs;
  }

  getAllDependenciesRecursivelyIn(seen: Dependency[] = []): void {
    this.dependencies.forEach((d) => {
      // Check circular dependency.
      if (seen.some((s) => s.isEqual(d))) {
        throw new Error('Found circular dependencies!');
      }

      seen.push(d);
      if (d.isParentRelationship() || d.getRelationship() === undefined) {
        d.to.getAllDependenciesRecursivelyIn(seen);
      }
    });
  }

  getChild(modelName: string, filters: { key: string; value: any }[]): Model<unknown, unknown> | undefined {
    const dependency = this.getChildren(modelName)[modelName]?.find((d) =>
      filters.every((c) => d.to[c.key] === c.value),
    );
    return dependency ? dependency.to : undefined;
  }

  getChildren(modelName?: string): { [key: string]: Dependency[] } {
    return this.dependencies
      .filter((d) => d.isParentRelationship() && (modelName ? d.to.MODEL_NAME === modelName : true))
      .reduce((accumulator, currentValue) => {
        if (!(currentValue.to.MODEL_NAME in accumulator)) {
          accumulator[currentValue.to.MODEL_NAME] = [];
        }
        accumulator[currentValue.to.MODEL_NAME].push(currentValue);
        return accumulator;
      }, {});
  }

  abstract getContext(): string;

  getMatchingDependencies(onField: string, onAction: DiffAction): Dependency[] {
    return this.dependencies.filter((d) => d.hasMatchingBehavior(onField, onAction));
  }

  getParents(modelName?: string): { [key: string]: Dependency[] } {
    return this.dependencies
      .filter((d) => d.isChildRelationship() && (modelName ? d.from.MODEL_NAME === modelName : true))
      .reduce((accumulator, currentValue) => {
        if (!(currentValue.to.MODEL_NAME in accumulator)) {
          accumulator[currentValue.to.MODEL_NAME] = [];
        }
        accumulator[currentValue.to.MODEL_NAME].push(currentValue);
        return accumulator;
      }, {});
  }

  abstract synth(): I;
}
