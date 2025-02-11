import type { NodeSchema, NodeType, UnknownNode } from '../../app.type.js';
import { NodeError } from '../../errors/index.js';
import { Dependency, type DependencyRelationship } from '../dependency/dependency.js';
import { type Diff, DiffAction } from '../diff/diff.js';
import type { INode } from './node.interface.js';

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
export abstract class ANode<S, T> implements INode<S, T> {
  /**
   * The name of the node.
   * All nodes with same name are of the same category.
   */
  static readonly NODE_NAME: string;

  /**
   * The package of the node.
   */
  static readonly NODE_PACKAGE: string;

  /**
   * The schema of the node.
   */
  static readonly NODE_SCHEMA: NodeSchema<ANode<unknown, unknown>>;

  /**
   * The type of the node.
   */
  static readonly NODE_TYPE: NodeType;

  /**
   * The context of the node.
   * It is a string representation of self that uniquely identifies self in the graph.
   */
  private context: string;

  /**
   * A set of node dependencies with other nodes, represented using a {@link Dependency}.
   */
  private readonly dependencies: Dependency[] = [];

  addChild(
    onField: keyof T | string,
    child: UnknownNode,
    toField: string,
  ): { childToParentDependency: Dependency; parentToChildDependency: Dependency } {
    const cIndex = child.dependencies.findIndex((d) => Object.is(d.to, this));
    const pIndex = this.dependencies.findIndex((d) => Object.is(d.to, child));
    if (cIndex !== -1 || pIndex !== -1) {
      throw new NodeError('Dependency relationship already exists!', this);
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

  addFieldDependency(
    behaviors: { forAction: DiffAction; onAction: DiffAction; onField: keyof T | string; toField: keyof T | string }[],
  ): void {
    const index = this.dependencies.findIndex((d) => Object.is(d.from, this) && Object.is(d.to, this));
    const dependency = index > -1 ? this.dependencies[index] : new Dependency(this, this);
    if (index === -1) {
      this.dependencies.push(dependency);
    }

    for (const behavior of behaviors) {
      if (
        !dependency.hasMatchingBehavior(
          behavior.onField as string,
          behavior.onAction,
          behavior.toField as string,
          behavior.forAction,
        )
      ) {
        dependency.addBehavior(
          behavior.onField as string,
          behavior.onAction,
          behavior.toField as string,
          behavior.forAction,
        );
      }
    }
  }

  addRelationship(to: UnknownNode): { thisToThatDependency: Dependency } {
    const thisToThatDependency = new Dependency(this, to);
    this.dependencies.push(thisToThatDependency);
    return { thisToThatDependency };
  }

  abstract diff(previous?: T): Promise<Diff[]>;

  abstract diffProperties(previous: T): Promise<Diff[]>;

  getAncestors(): UnknownNode[] {
    const members: UnknownNode[] = [this];
    const membersProcessed: UnknownNode[] = [];

    while (members.length > 0) {
      const member = members.pop() as UnknownNode;

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

  getBoundaryMembers(): UnknownNode[] {
    const extenders: UnknownNode[] = [this];
    const members: UnknownNode[] = [];
    const parentOf: { [key: string]: string[] } = {};

    const pushToExtenders = (nodes: UnknownNode[]): void => {
      nodes.forEach((node) => {
        if (!members.some((m) => m.getContext() === node.getContext())) {
          extenders.push(node);
        }
      });
    };

    while (extenders.length > 0) {
      const node = extenders.pop() as UnknownNode;
      const ancestors = node.getAncestors();

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
              throw new NodeError('Found circular dependencies!', this);
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

      const children = node.getChildren();
      for (const name in children) {
        pushToExtenders(children[name].map((d) => d.to));
      }

      const dependents = node.dependencies
        .filter((d) => !d.isParentRelationship() && !d.isChildRelationship())
        .map((d) => d.to);
      pushToExtenders(dependents);
    }

    return members;
  }

  getChild(name: string, filters: { key: string; value: any }[] = []): UnknownNode | undefined {
    const dependencies = this.getChildren(name)[name]?.filter((d) => filters.every((c) => d.to[c.key] === c.value));
    if (!dependencies) {
      return undefined;
    }
    if (dependencies.length > 1) {
      throw new NodeError('More than one children found! Use getChildren() instead.', this);
    }
    return dependencies[0].to;
  }

  getChildren(name?: string): { [key: string]: Dependency[] } {
    return this.dependencies
      .filter((d) => d.isParentRelationship() && (name ? (d.to.constructor as typeof ANode).NODE_NAME === name : true))
      .reduce((accumulator, currentValue) => {
        if (!((currentValue.to.constructor as typeof ANode).NODE_NAME in accumulator)) {
          accumulator[(currentValue.to.constructor as typeof ANode).NODE_NAME] = [];
        }
        accumulator[(currentValue.to.constructor as typeof ANode).NODE_NAME].push(currentValue);
        return accumulator;
      }, {});
  }

  getContext(): string {
    if (!this.context) {
      this.context = this.setContext();
    }
    return this.context;
  }

  getDependencies(to?: UnknownNode): Dependency[] {
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

  getDependency(to: UnknownNode, relationship: DependencyRelationship): Dependency | undefined {
    const index = this.getDependencyIndex(to, relationship);
    return index > -1 ? this.dependencies[index] : undefined;
  }

  getDependencyIndex(to: UnknownNode, relationship: DependencyRelationship): number {
    return this.dependencies.findIndex(
      (d) =>
        d.from.getContext() === this.getContext() &&
        d.to.getContext() === to.getContext() &&
        d.getRelationship() !== undefined &&
        d.getRelationship()!.type === relationship,
    );
  }

  getParents(name?: string): { [key: string]: Dependency[] } {
    return this.dependencies
      .filter((d) => d.isChildRelationship() && (name ? (d.to.constructor as typeof ANode).NODE_NAME === name : true))
      .reduce((accumulator, currentValue) => {
        if (!((currentValue.to.constructor as typeof ANode).NODE_NAME in accumulator)) {
          accumulator[(currentValue.to.constructor as typeof ANode).NODE_NAME] = [];
        }
        accumulator[(currentValue.to.constructor as typeof ANode).NODE_NAME].push(currentValue);
        return accumulator;
      }, {});
  }

  getSiblings(name?: string): { [key: string]: Dependency[] } {
    return this.dependencies
      .filter(
        (d) =>
          !d.isChildRelationship() &&
          !d.isParentRelationship() &&
          (name ? (d.to.constructor as typeof ANode).NODE_NAME === name : true),
      )
      .reduce((accumulator, currentValue) => {
        if (!((currentValue.to.constructor as typeof ANode).NODE_NAME in accumulator)) {
          accumulator[(currentValue.to.constructor as typeof ANode).NODE_NAME] = [];
        }
        accumulator[(currentValue.to.constructor as typeof ANode).NODE_NAME].push(currentValue);
        return accumulator;
      }, {});
  }

  hasAncestor(node: UnknownNode): boolean {
    const nodeParts = node
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

      return nodeParts.every((p) => ancestorParts[p[0]] === p[1]);
    });
  }

  removeDependency(dependencyIndex: number): void {
    if (dependencyIndex > -1 && dependencyIndex < this.dependencies.length) {
      this.dependencies.splice(dependencyIndex, 1);
    }
  }

  removeRelationship(node: UnknownNode): void {
    for (let i = this.dependencies.length - 1; i >= 0; i--) {
      const dependency = this.dependencies[i];
      if (dependency.to.getContext() === node.getContext()) {
        this.dependencies.splice(i, 1);
      }
    }

    for (let i = node.dependencies.length - 1; i >= 0; i--) {
      const dependency = node.dependencies[i];
      if (dependency.to.getContext() === this.getContext()) {
        node.dependencies.splice(i, 1);
      }
    }
  }

  abstract setContext(): string;

  abstract synth(): S;

  toJSON(): S {
    return {
      context: this.getContext(),
      ...this.synth(),
    };
  }

  /**
   * To create self given its serialized representation.
   * - First argument is the serialized representation.
   * - Second argument is the `deReferenceContext()` function to resolve other nodes self depends on.
   */
  static async unSynth(...args: unknown[]): Promise<UnknownNode> {
    if (args.length > 4) {
      throw new Error('Too many args in unSynth()');
    }

    throw new Error('Method not implemented! Use derived class implementation');
  }
}
