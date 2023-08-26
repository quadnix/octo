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
  readonly MODEL_TYPE: IModel<I, T>['MODEL_TYPE'] = 'model';

  protected readonly dependencies: Dependency[] = [];

  addChild(onField: keyof T, child: Model<unknown, unknown>, toField: string): void {
    // Check if child already has a dependency to self.
    const cIndex = child.dependencies.findIndex((d) => Object.is(d.to, this));
    if (cIndex !== -1 && child.dependencies[cIndex].isParentRelationship()) {
      throw new Error('Found circular dependencies!');
    }

    const childToParentDependency = cIndex === -1 ? new Dependency(child, this) : child.dependencies[cIndex];
    childToParentDependency.addBehavior(toField, DiffAction.ADD, onField as string, DiffAction.ADD);
    childToParentDependency.addBehavior(toField, DiffAction.ADD, onField as string, DiffAction.UPDATE);
    if (cIndex === -1) {
      childToParentDependency.addChildRelationship(toField, onField as string);
      child.dependencies.push(childToParentDependency);
    }

    // Check if parent already has a dependency to child.
    const pIndex = this.dependencies.findIndex((d) => Object.is(d.to, child));
    if (pIndex !== -1 && this.dependencies[pIndex].isChildRelationship()) {
      throw new Error('Found circular dependencies!');
    }
    const parentToChildDependency = pIndex === -1 ? new Dependency(this, child) : this.dependencies[pIndex];
    parentToChildDependency.addBehavior(onField as string, DiffAction.DELETE, toField, DiffAction.DELETE);
    if (pIndex === -1) {
      parentToChildDependency.addParentRelationship(onField as string, toField);
      this.dependencies.push(parentToChildDependency);
    }
  }

  async diff(previous?: T): Promise<Diff[]> {
    const childrenByModel = this.getChildren();
    const childrenOfPreviousByModel = (previous as Model<unknown, unknown>)?.getChildren() ?? {};

    const diffs: Diff[] = [];
    const modelsSeen: string[] = [];

    for (const modelName in childrenByModel) {
      const children = childrenByModel[modelName].map((d) => d.to);
      const childrenOfPrevious = childrenOfPreviousByModel[modelName]?.map((d) => d.to) ?? [];
      const field = childrenByModel[modelName][0].getRelationship()!.toField;
      const childrenDiffs = await DiffUtility.diffModels(childrenOfPrevious, children, field as string);
      diffs.push(...childrenDiffs);

      modelsSeen.push(modelName);
    }

    for (const modelName in childrenOfPreviousByModel) {
      if (modelsSeen.indexOf(modelName) !== -1) {
        continue;
      }

      const children = [];
      const childrenOfPrevious = childrenOfPreviousByModel[modelName].map((d) => d.to);
      const field = childrenOfPreviousByModel[modelName][0].getRelationship()!.toField;
      const childrenDiffs = await DiffUtility.diffModels(childrenOfPrevious, children, field as string);
      diffs.push(...childrenDiffs);
    }

    return diffs;
  }

  /**
   * Get an array of ancestors which must exist for self to exist.
   */
  getAncestors(): Model<unknown, unknown>[] {
    const members: Model<unknown, unknown>[] = [this];
    const membersProcessed: Model<unknown, unknown>[] = [];

    while (members.length > 0) {
      const member = members.pop() as Model<unknown, unknown>;

      for (const d of member.dependencies) {
        // If in dependency I am not declared a parent, then d.to is either my parent or has a relationship to me.
        // The behavior of that relationship should be that it must exist for me to exist.
        if (
          !d.isParentRelationship() &&
          d.hasMatchingBehavior(undefined, DiffAction.ADD, undefined, DiffAction.ADD) &&
          !membersProcessed.some((m) => m.getContext() === d.to.getContext())
        ) {
          members.push(d.to);
        }
      }

      membersProcessed.push(member);
    }

    return membersProcessed;
  }

  /**
   * Get a boundary (sub graph) of a model, i.e. an array of models that must belong together.
   * To generate a boundary, we must process all children and grand-children of self.
   */
  getBoundaryMembers(): Model<unknown, unknown>[] {
    const extenders: Model<unknown, unknown>[] = [this];
    const members: Model<unknown, unknown>[] = [];
    const parentOf: { [key: string]: string[] } = {};

    while (extenders.length > 0) {
      const model = extenders.pop() as Model<unknown, unknown>;
      const ancestors = model.getAncestors();

      for (const ancestor of ancestors) {
        // Skip processing an already processed ancestor.
        if (members.some((m) => m.getContext() === ancestor.getContext())) {
          continue;
        }
        members.push(ancestor);

        // Check for circular dependencies on ancestor.
        for (const d of ancestor.dependencies) {
          let childContext;
          let parentContext;
          if (d.isParentRelationship()) {
            childContext = d.to.getContext();
            parentContext = d.from.getContext();
          } else if (d.isChildRelationship()) {
            childContext = d.from.getContext();
            parentContext = d.to.getContext();
          } else {
            // A relationship that is neither parent or child, will not be reported in circular dependency!
            continue;
          }

          const seen: { [key: string]: boolean } = {};
          const toProcess: string[] = [parentContext];
          while (toProcess.length > 0) {
            const context = toProcess.pop() as string;
            if (seen[context]) {
              throw new Error('Found circular dependencies!');
            } else {
              seen[context] = true;
            }
            toProcess.push(...(parentOf[context] || []));
          }

          if (!parentOf[childContext]) {
            parentOf[childContext] = [];
            parentOf[childContext].push(parentContext);
          } else if (!parentOf[childContext].some((p) => p === parentContext)) {
            parentOf[childContext].push(parentContext);
          }
        }
      }

      const children = model.getChildren();
      for (const modelName in children) {
        extenders.push(...children[modelName].map((d) => d.to));
      }
    }

    return members;
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

  hasAncestor(model: Model<unknown, unknown>): boolean {
    const modelParts = model
      .getContext()
      .split(',')
      .map((p) => p.split('='));

    const ancestors = this.getAncestors();
    return ancestors.some((a) => {
      const ancestorParts = a
        .getContext()
        .split(',')
        .reduce((map, p) => {
          const parts = p.split('=');
          map[parts[0]] = parts[1];
          return map;
        }, {});

      return modelParts.every((p) => ancestorParts[p[0]] === p[1]);
    });
  }

  abstract synth(): I;
}
