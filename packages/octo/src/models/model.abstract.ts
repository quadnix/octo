import { ModelType, type UnknownModel } from '../app.type.js';
import { Dependency, type DependencyRelationship } from '../functions/dependency/dependency.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import type { AAnchor } from '../overlays/anchor.abstract.js';
import type { IModel } from './model.interface.js';

/**
 * This is the base implementation of the Model's interface,
 * and is used to define common functionality between all models.
 * All models are an extension of this class.
 */
export abstract class AModel<I, T> implements IModel<I, T> {
  abstract readonly MODEL_NAME: string;
  readonly MODEL_TYPE: ModelType = ModelType.MODEL;

  private _deleteMarker = false;

  private readonly anchors: AAnchor[] = [];

  private readonly dependencies: Dependency[] = [];

  addAnchor(anchor: AAnchor): void {
    const existingAnchor = this.getAnchor(anchor.anchorId, anchor.getParent());
    if (existingAnchor) {
      throw new Error('Anchor already exists!');
    }
    this.anchors.push(anchor);
  }

  addChild(
    onField: keyof T | string,
    child: UnknownModel,
    toField: string,
  ): { childToParentDependency: Dependency; parentToChildDependency: Dependency } {
    const cIndex = child.dependencies.findIndex((d) => Object.is(d.to, this));
    const pIndex = this.dependencies.findIndex((d) => Object.is(d.to, child));
    if (cIndex !== -1 || pIndex !== -1) {
      throw new Error('Dependency relationship already exists!');
    }

    const childToParentDependency = new Dependency(child, this);
    childToParentDependency.addBehavior(toField, DiffAction.ADD, onField as string, DiffAction.ADD);
    childToParentDependency.addBehavior(toField, DiffAction.ADD, onField as string, DiffAction.UPDATE);
    childToParentDependency.addChildRelationship(toField, onField as string);
    child.dependencies.push(childToParentDependency);

    const parentToChildDependency = new Dependency(this, child);
    parentToChildDependency.addBehavior(onField as string, DiffAction.DELETE, toField, DiffAction.DELETE);
    parentToChildDependency.addParentRelationship(onField as string, toField);
    this.dependencies.push(parentToChildDependency);

    return { childToParentDependency, parentToChildDependency };
  }

  addRelationship(to: UnknownModel): { thatToThisDependency: Dependency; thisToThatDependency: Dependency } {
    const thisToThatDependency = new Dependency(this, to);
    this.dependencies.push(thisToThatDependency);
    const thatToThisDependency = new Dependency(to, this);
    to.dependencies.push(thatToThisDependency);
    return { thatToThisDependency, thisToThatDependency };
  }

  deriveDependencyField(): string | undefined {
    return this.dependencies.find((d) => d.getRelationship() !== undefined)?.getRelationship()!.onField;
  }

  async diff(previous?: T): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const previousChildrenByModels = (previous as UnknownModel)?.getChildren() ?? {};
    const currentChildrenByModels = this.getChildren();

    // Compare previous children with current children.
    for (const modelName of Object.keys(previousChildrenByModels)) {
      const previousChildren = previousChildrenByModels[modelName].map((d) => d.to);
      const currentChildren = currentChildrenByModels[modelName]?.map((d) => d.to) || [];
      const field = previousChildrenByModels[modelName][0].getRelationship()!.toField;
      const childrenDiffs = await DiffUtility.diffModels(previousChildren, currentChildren, field as string);
      diffs.push(...childrenDiffs);
    }

    // Add new children not in previous.
    for (const modelName of Object.keys(currentChildrenByModels)) {
      if (previousChildrenByModels.hasOwnProperty(modelName)) {
        continue;
      }

      const previousChildren = [];
      const currentChildren = currentChildrenByModels[modelName].map((d) => d.to);
      const field = currentChildrenByModels[modelName][0].getRelationship()!.toField;
      const childrenDiffs = await DiffUtility.diffModels(previousChildren, currentChildren, field as string);
      diffs.push(...childrenDiffs);
    }

    const previousSiblingsByModels = (previous as UnknownModel)?.getSiblings() ?? {};
    const currentSiblingsByModels = this.getSiblings();

    // Compare previous siblings with current siblings.
    for (const modelName of Object.keys(previousSiblingsByModels)) {
      const previousSiblings = previousSiblingsByModels[modelName];
      const currentSiblings = currentSiblingsByModels[modelName] || [];

      for (const pd of previousSiblings) {
        if (!currentSiblings.find((cd) => cd.to.getContext() === pd.to.getContext())) {
          diffs.push(new Diff(this, DiffAction.DELETE, 'sibling', pd.to));
        }
      }
      for (const cd of currentSiblings) {
        if (!previousSiblings.find((pd) => pd.to.getContext() === cd.to.getContext())) {
          diffs.push(new Diff(this, DiffAction.ADD, 'sibling', cd.to));
        }
      }
    }

    // Add new siblings not in previous.
    for (const modelName of Object.keys(currentSiblingsByModels)) {
      if (previousSiblingsByModels.hasOwnProperty(modelName)) {
        continue;
      }

      const currentSiblings = currentSiblingsByModels[modelName];

      for (const cd of currentSiblings) {
        diffs.push(new Diff(this, DiffAction.ADD, 'sibling', cd.to));
      }
    }

    const field = this.deriveDependencyField() || '';
    const fieldValue = field ? this[field] : '';
    if (this.isMarkedDeleted()) {
      diffs.push(new Diff(this, DiffAction.DELETE, field, fieldValue));
    } else if (!previous) {
      diffs.push(new Diff(this, DiffAction.ADD, field, fieldValue));
    } else {
      const pDiffs = await this.diffProperties(previous);
      diffs.push(...pDiffs);
    }

    return diffs;
  }

  abstract diffProperties(previous: T): Promise<Diff[]>;

  /**
   * Get an array of ancestors which must exist for self to exist.
   */
  getAncestors(): UnknownModel[] {
    const members: UnknownModel[] = [this];
    const membersProcessed: UnknownModel[] = [];

    while (members.length > 0) {
      const member = members.pop() as UnknownModel;

      // Skip processing an already processed member.
      if (membersProcessed.some((m) => m.getContext() === member.getContext())) {
        continue;
      }

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

  getAnchor(anchorId: string, parent?: UnknownModel): AAnchor | undefined {
    const index = this.getAnchorIndex(anchorId, parent);
    return index > -1 ? this.anchors[index] : undefined;
  }

  getAnchorIndex(anchorId: string, parent?: UnknownModel): number {
    return this.anchors.findIndex(
      (a) => a.anchorId === anchorId && a.getParent().getContext() === (parent || this).getContext(),
    );
  }

  getAnchors(filters: { key: string; value: any }[] = []): AAnchor[] {
    return this.anchors.filter((a) => filters.every((c) => a[c.key] === c.value));
  }

  /**
   * Get a boundary (sub graph) of a model, i.e. an array of models that must belong together.
   * To generate a boundary, we must process all children and grand-children of self.
   */
  getBoundaryMembers(): UnknownModel[] {
    if (this.MODEL_TYPE !== ModelType.MODEL) {
      return [];
    }

    const extenders: UnknownModel[] = [this];
    const members: UnknownModel[] = [];
    const parentOf: { [key: string]: string[] } = {};

    const pushToExtenders = (models: UnknownModel[]): void => {
      models.forEach((model) => {
        if (model.MODEL_TYPE !== ModelType.MODEL) {
          return;
        }
        if (!members.some((m) => m.getContext() === model.getContext())) {
          extenders.push(model);
        }
      });
    };

    while (extenders.length > 0) {
      const model = extenders.pop() as UnknownModel;
      const ancestors = model.getAncestors();

      for (const ancestor of ancestors) {
        // Skip processing an already processed ancestor.
        if (members.some((m) => m.getContext() === ancestor.getContext())) {
          continue;
        }
        // Skip processing Non-MODEL ancestors.
        if (ancestor.MODEL_TYPE !== ModelType.MODEL) {
          continue;
        }
        members.push(ancestor);

        // Check for circular dependencies on ancestor.
        for (const d of ancestor.dependencies) {
          let childContext: string;
          let parentContext: string;
          if (d.isParentRelationship()) {
            childContext = d.to.getContext();
            parentContext = d.from.getContext();
          } else if (d.isChildRelationship()) {
            childContext = d.from.getContext();
            parentContext = d.to.getContext();
          } else {
            // A relationship that is neither parent nor child, will not be reported in circular dependency!
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
        pushToExtenders(children[modelName].map((d) => d.to));
      }

      const dependents = model.dependencies
        .filter((d) => !d.isParentRelationship() && !d.isChildRelationship())
        .map((d) => d.to);
      pushToExtenders(dependents);
    }

    return members;
  }

  getChild(modelName: string, filters: { key: string; value: any }[] = []): UnknownModel | undefined {
    const dependencies = this.getChildren(modelName)[modelName]?.filter((d) =>
      filters.every((c) => d.to[c.key] === c.value),
    );
    if (!dependencies) {
      return undefined;
    }
    if (dependencies.length > 1) {
      throw new Error('More than one children found! Use getChildren() instead.');
    }
    return dependencies[0].to;
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

  getDependencies(to?: UnknownModel): Dependency[] {
    const filters: { key: string; value: string }[] = [];
    if (to) {
      filters.push({ key: 'to', value: to.getContext() });
    }

    return this.dependencies.filter((d) => {
      return filters.every((c) => {
        if (c.key === 'to') {
          return d.to.getContext() === c.value;
        } else {
          return true;
        }
      });
    });
  }

  getDependency(to: UnknownModel, relationship: DependencyRelationship): Dependency | undefined {
    const index = this.getDependencyIndex(to, relationship);
    return index > -1 ? this.dependencies[index] : undefined;
  }

  getDependencyIndex(to: UnknownModel, relationship: DependencyRelationship): number {
    return this.dependencies.findIndex(
      (d) =>
        d.from.getContext() === this.getContext() &&
        d.to.getContext() === to.getContext() &&
        d.getRelationship() !== undefined &&
        d.getRelationship()!.type === relationship,
    );
  }

  getParents(modelName?: string): { [key: string]: Dependency[] } {
    return this.dependencies
      .filter((d) => d.isChildRelationship() && (modelName ? d.to.MODEL_NAME === modelName : true))
      .reduce((accumulator, currentValue) => {
        if (!(currentValue.to.MODEL_NAME in accumulator)) {
          accumulator[currentValue.to.MODEL_NAME] = [];
        }
        accumulator[currentValue.to.MODEL_NAME].push(currentValue);
        return accumulator;
      }, {});
  }

  getSiblings(modelName?: string): { [key: string]: Dependency[] } {
    return this.dependencies
      .filter(
        (d) =>
          !d.isChildRelationship() && !d.isParentRelationship() && (modelName ? d.to.MODEL_NAME === modelName : true),
      )
      .reduce((accumulator, currentValue) => {
        if (!(currentValue.to.MODEL_NAME in accumulator)) {
          accumulator[currentValue.to.MODEL_NAME] = [];
        }
        accumulator[currentValue.to.MODEL_NAME].push(currentValue);
        return accumulator;
      }, {});
  }

  hasAncestor(model: UnknownModel): boolean {
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

  isMarkedDeleted(): boolean {
    return this._deleteMarker;
  }

  remove(ignoreDirectRelationships = false): void {
    // Verify model can be removed.
    for (const dependency of this.dependencies) {
      // When direct relationship is not ignored, this model can't be a parent or have direct relationships.
      // When direct relationship is ignored, this model can't be a parent.
      if (
        (!ignoreDirectRelationships && !dependency.isChildRelationship()) ||
        (ignoreDirectRelationships && dependency.isParentRelationship())
      ) {
        throw new Error('Cannot remove model until dependent models exist!');
      }
    }

    // Removing all dependencies that points to this.
    for (const dependency of this.dependencies) {
      const index = dependency.to.dependencies.findIndex((d) => d.to.getContext() === this.getContext());
      dependency.to.dependencies.splice(index, 1);
    }

    this._deleteMarker = true;
  }

  removeAllAnchors(): void {
    let anchors = this.getAnchors();
    while (anchors.length > 0) {
      this.removeAnchor(anchors[0]);
      anchors = this.getAnchors();
    }
  }

  removeAnchor(anchor: AAnchor): void {
    const existingAnchorIndex = this.getAnchorIndex(anchor.anchorId, anchor.getParent());
    if (existingAnchorIndex !== -1) {
      this.anchors.splice(existingAnchorIndex, 1);
    }
  }

  removeDependency(dependencyIndex: number): void {
    if (dependencyIndex > -1 && dependencyIndex < this.dependencies.length) {
      this.dependencies.splice(dependencyIndex, 1);
    }
  }

  removeRelationship(model: UnknownModel): void {
    for (let i = this.dependencies.length - 1; i >= 0; i--) {
      const dependency = this.dependencies[i];
      if (dependency.to.getContext() === model.getContext()) {
        this.dependencies.splice(i, 1);
      }
    }

    for (let i = model.dependencies.length - 1; i >= 0; i--) {
      const dependency = model.dependencies[i];
      if (dependency.to.getContext() === this.getContext()) {
        model.dependencies.splice(i, 1);
      }
    }
  }

  abstract synth(): I;

  static async unSynth(...args: unknown[]): Promise<UnknownModel> {
    if (args.length > 4) {
      throw new Error('Too many args in unSynth()');
    }

    throw new Error('Method not implemented! Use derived class implementation');
  }
}
