import { ModelType, type UnknownModel } from '../app.type.js';
import { Dependency, type DependencyRelationship } from '../functions/dependency/dependency.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import type { AAnchor } from '../overlays/anchor.abstract.js';
import type { IModel } from './model.interface.js';

/**
 * This is Octo's base class, and all other classes extend from it.
 * It helps provide a common set of methods and properties that is core to Octo.
 *
 * Octo is built as a graph, and this base class can be considered as a generic node.
 * Nodes can have children, and siblings, but only if connected via an edge, called {@link Dependency} here.
 *
 * From this base class, three more base classes are derived,
 * - [Models](/docs/fundamentals/models)
 * - [Resources](/docs/fundamentals/resources)
 * - [Overlays](/docs/fundamentals/overlay-and-anchor)
 *
 * Each of these derived base classes, using the base methods of this class,
 * define their own specific rules on how their graphs should be constructed.
 */
export abstract class AModel<I, T> implements IModel<I, T> {
  abstract readonly MODEL_NAME: string;
  readonly MODEL_TYPE: ModelType = ModelType.MODEL;

  private _deleteMarker = false;

  private readonly anchors: AAnchor[] = [];

  private context: string;

  private readonly dependencies: Dependency[] = [];

  /**
   * To add an {@link Anchor}.
   *
   * Each node can store multiple anchors for reference.
   * These anchors don't necessarily need to be parented by self, but must be unique,
   * i.e. an anchor, identified by it's parent, cannot be added twice to self's list of anchors.
   */
  addAnchor(anchor: AAnchor): void {
    const existingAnchor = this.getAnchor(anchor.anchorId, anchor.getParent());
    if (!existingAnchor) {
      this.anchors.push(anchor);
    }
  }

  /**
   * To add another node as a child of self.
   *
   * Every node must have a unique ID against other nodes of the same {@link MODEL_NAME}.
   * This ID is how Octo differentiates similar nodes, and keeps track of them.
   * But because each node is free to define their own fields,
   * the fields containing the ID are a necessary input to this method.
   *
   * @example
   * ```ts
   * const region = new Region('region');
   * const environment = new Environment('qa');
   * region.addChild('regionId', environment, 'environmentName');
   * ```
   * @param onField The field in self which contains the unique ID.
   * @param child The child node.
   * @param toField The field in child which contains the unique ID.
   * @returns
   * - childToParentDependency: The dependency edge from child to self.
   * - parentToChildDependency: The dependency edge from self to child.
   */
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

  /**
   * To add another node as a sibling of self.
   *
   * @example
   * ```ts
   * const region1 = new Region('region-1');
   * const region2 = new Region('region-2');
   * region1.addSibling(region2);
   * ```
   * @param to The sibling node.
   * @returns
   * - thatToThisDependency: The dependency edge from sibling to self.
   * - thisToThatDependency: The dependency edge from self to sibling.
   */
  addRelationship(to: UnknownModel): { thatToThisDependency: Dependency; thisToThatDependency: Dependency } {
    const thisToThatDependency = new Dependency(this, to);
    this.dependencies.push(thisToThatDependency);
    const thatToThisDependency = new Dependency(to, this);
    to.dependencies.push(thatToThisDependency);
    return { thatToThisDependency, thisToThatDependency };
  }

  /**
   * To derive the name of the field in self which contains the ID.
   *
   * @remarks This method does a best attempt search of the field name by traversing all dependencies of self.
   * But if the dependencies lack, or have not been added yet, this method might return `undefined`.
   * That does not mean that such a field does not exist,
   * but rather that it wasn't possible to derive the name at that point.
   * @returns The name of the field in self which contains the ID, or `undefined` if not found.
   */
  deriveDependencyField(): string | undefined {
    return this.dependencies.find((d) => d.getRelationship() !== undefined)?.getRelationship()!.onField;
  }

  /**
   * Compares and calculates the difference between the current version of self node, and the previous version.
   * - Recursively compares self children too.
   *
   * @param previous The previous version of self.
   */
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
        // Skip OVERLAY sibling, since overlays are diffed separately.
        if (pd.to.MODEL_TYPE === ModelType.OVERLAY) {
          continue;
        }

        if (!currentSiblings.find((cd) => cd.to.getContext() === pd.to.getContext())) {
          diffs.push(new Diff(this, DiffAction.DELETE, 'sibling', pd.to));
        }
      }
      for (const cd of currentSiblings) {
        // Skip OVERLAY sibling, since overlays are diffed separately.
        if (cd.to.MODEL_TYPE === ModelType.OVERLAY) {
          continue;
        }

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
        // Skip OVERLAY sibling, since overlays are diffed separately.
        if (cd.to.MODEL_TYPE === ModelType.OVERLAY) {
          continue;
        }

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

  /**
   * To compare properties of the current version of self node, vs. the previous version.
   * It is a helper method to the `diff()` method.
   * - This method is called by the {@link diff()} method.
   *
   * @param previous The previous version of self.
   */
  abstract diffProperties(previous: T): Promise<Diff[]>;

  /**
   * To get all ancestors of self.
   * - Includes parent nodes.
   * - Might include sibling nodes, if they are necessary for self node to exist.
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

  /**
   * To get an anchor with a given ID and parent.
   *
   * @param anchorId The ID of the anchor.
   * @param parent The parent of the anchor.
   * - If parent is not given, then self is considered the parent of this anchor.
   */
  getAnchor(anchorId: string, parent?: UnknownModel): AAnchor | undefined {
    const index = this.getAnchorIndex(anchorId, parent);
    return index > -1 ? this.anchors[index] : undefined;
  }

  /**
   * To get the index of an anchor with a given ID and parent.
   *
   * @param anchorId The ID of the anchor.
   * @param parent The parent of the anchor.
   * - If parent is not given, then self is considered the parent of this anchor.
   */
  getAnchorIndex(anchorId: string, parent?: UnknownModel): number {
    return this.anchors.findIndex(
      (a) => a.anchorId === anchorId && a.getParent().getContext() === (parent || this).getContext(),
    );
  }

  /**
   * To get all anchors, filtered by anchor properties.
   *
   * @param filters A set of filters, where `key` is the property name and `value` is the value to filter by.
   */
  getAnchors(filters: { key: string; value: any }[] = []): AAnchor[] {
    return this.anchors.filter((a) => filters.every((c) => a[c.key] === c.value));
  }

  /**
   * To get a boundary (sub graph) of self.
   * A boundary is a group of nodes that must belong together.
   * The boundary consists of all nodes associated with self,
   * which includes parents, grand parents, children, grand children, and siblings.
   */
  getBoundaryMembers(): UnknownModel[] {
    const extenders: UnknownModel[] = [this];
    const members: UnknownModel[] = [];
    const parentOf: { [key: string]: string[] } = {};

    const pushToExtenders = (models: UnknownModel[]): void => {
      models.forEach((model) => {
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

  /**
   * To get a child of self that matches the given filters.
   *
   * @param modelName The {@link MODEL_NAME} of the child.
   * @param filters A set of filters, to be applied on children,
   * where `key` is the property name and `value` is the value to filter by.
   * @throws {@link Error} If more than one child is found.
   */
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

  /**
   * To get all children of self.
   *
   * @example
   * ```ts
   * const children = region.getChildren('environment');
   * const environments = children['environment'].map((d) => d.to);
   * ```
   * @param modelName The {@link MODEL_NAME} of the children.
   * @returns All children as an object with the {@link MODEL_NAME} as the key,
   * and self's dependency to the child as the value.
   */
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

  /**
   * To get the context of self.
   * A context is a string representation of self that uniquely identifies self in the graph.
   *
   * @example
   * ```ts
   * const app = new App('my-app');
   * const region = new Region('my-region');
   * app.addRegion(region);
   * const context = region.getContext(); // "region=my-region,app=my-app"
   * ```
   */
  getContext(): string {
    if (!this.context) {
      this.context = this.setContext();
    }
    return this.context;
  }

  /**
   * To get all dependencies of self.
   * - Can be filtered to just dependencies with a single node.
   *
   * @param to The other node. If present, will only return dependencies of self with this node.
   */
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

  /**
   * To get a dependency of self with another node.
   *
   * @param to The other node.
   * @param relationship The relationship between self and the other node.
   * @returns The dependency with the other node having the given relationship, or `undefined` if not found.
   */
  getDependency(to: UnknownModel, relationship: DependencyRelationship): Dependency | undefined {
    const index = this.getDependencyIndex(to, relationship);
    return index > -1 ? this.dependencies[index] : undefined;
  }

  /**
   * To get the index of a dependency of self with another node.
   *
   * @param to The other node.
   * @param relationship The relationship between self and the other node.
   * @returns The index of the dependency with the other node having the given relationship, or `-1` if not found.
   */
  getDependencyIndex(to: UnknownModel, relationship: DependencyRelationship): number {
    return this.dependencies.findIndex(
      (d) =>
        d.from.getContext() === this.getContext() &&
        d.to.getContext() === to.getContext() &&
        d.getRelationship() !== undefined &&
        d.getRelationship()!.type === relationship,
    );
  }

  /**
   * To get all parent of self.
   *
   * @example
   * ```ts
   * const parents = environment.getParents('region');
   * const regions = parents['region'].map((d) => d.to);
   * ```
   * @param modelName The {@link MODEL_NAME} of the parent.
   * @returns All parents as an object with the {@link MODEL_NAME} as the key,
   * and self's dependency to the parent as the value.
   */
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

  /**
   * To get all siblings of self.
   *
   * :::note Note
   * Two environments, or two regions, etc. are not automatically considered siblings,
   * unless they have a dependency between them.
   *
   * ```ts
   * const environment1 = new Environment('qa');
   * const environment2 = new Environment('prod');
   * const region = new Region('region');
   * region.addEnvironment(environment1);
   * region.addEnvironment(environment2);
   * environment1.getSiblings('environment'); // This won't return a dependency to environment2.
   * ```
   * :::
   *
   * @example
   * ```ts
   * const siblings = environment.getSiblings('image');
   * const images = siblings['image'].map((d) => d.to);
   * ```
   * @param modelName The {@link MODEL_NAME} of the sibling.
   * @returns All siblings as an object with the {@link MODEL_NAME} as the key,
   * and self's dependency to the sibling as the value.
   */
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

  /**
   * To check if given node is an ancestor of self.
   *
   * @param model The other node.
   */
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

  /**
   * To check if self is marked as deleted.
   * A deleted node will be removed from the graph after the transaction.
   */
  isMarkedDeleted(): boolean {
    return this._deleteMarker;
  }

  /**
   * To mark self as deleted.
   * A deleted node will be removed from the graph after the transaction.
   * - A node cannot be deleted if it has dependencies.
   * - Unless the dependency is a sibling dependency and `ignoreDirectRelationships` is `true`.
   *
   * @example
   * ```ts
   * const region1 = new Region('region-1');
   * const environment = new Environment('environment');
   * region1.addEnvironment(environment);
   * const region2 = new Region('region-2');
   * region1.addSibling(region2);
   *
   * // Cannot remove region1 because it has dependencies.
   * region1.remove(); // throws.
   *
   * // Still can't remove region1 because it has a sibling dependency.
   * environment.remove(); // ok.
   * region1.remove(); // throws.
   *
   * // But can remove region1 when sibling relationships are ignored.
   * region1.remove(true); // ok.
   * ```
   * @param ignoreDirectRelationships Whether to ignore sibling relationships.
   * @throws {@link Error} If node contains dependencies to other nodes.
   */
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

  /**
   * To remove all anchors from self.
   */
  removeAllAnchors(): void {
    let anchors = this.getAnchors();
    while (anchors.length > 0) {
      this.removeAnchor(anchors[0]);
      anchors = this.getAnchors();
    }
  }

  /**
   * To remove an anchor from self.
   *
   * @param anchor The anchor to remove.
   */
  removeAnchor(anchor: AAnchor): void {
    const existingAnchorIndex = this.getAnchorIndex(anchor.anchorId, anchor.getParent());
    if (existingAnchorIndex !== -1) {
      this.anchors.splice(existingAnchorIndex, 1);
    }
  }

  /**
   * To remove a dependency from self.
   *
   * @param dependencyIndex The index of the dependency to remove.
   */
  removeDependency(dependencyIndex: number): void {
    if (dependencyIndex > -1 && dependencyIndex < this.dependencies.length) {
      this.dependencies.splice(dependencyIndex, 1);
    }
  }

  /**
   * To remove ALL dependencies from self for the given node.
   *
   * @param model The other node.
   */
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

  /**
   * To set the context of self.
   * A context is a string representation of self that uniquely identifies self in the graph.
   */
  abstract setContext(): string;

  /**
   * Generates a serializable representation of self.
   */
  abstract synth(): I;

  /**
   * To create self given its serialized representation.
   * - First argument is the serialized representation.
   * - Second argument is the `deReferenceContext()` function to resolve other nodes self depends on.
   */
  static async unSynth(...args: unknown[]): Promise<UnknownModel> {
    if (args.length > 4) {
      throw new Error('Too many args in unSynth()');
    }

    throw new Error('Method not implemented! Use derived class implementation');
  }
}
