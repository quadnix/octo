import type { UnknownNode } from '../../app.type.js';
import type { Dependency, DependencyRelationship } from '../dependency/dependency.js';
import type { Diff, DiffAction } from '../diff/diff.js';

/**
 * {@link ANode} interface.
 */
export interface INode<S, T> {
  /**
   * To add another node as a child of self.
   *
   * @param onField The field in self on which the dependency is being defined.
   * @param child The child node.
   * @param toField The field in child on which the dependency is being defined.
   * @returns
   * - childToParentDependency: The dependency edge from child to self.
   * - parentToChildDependency: The dependency edge from self to child.
   * @throws {@link NodeError} If dependency relationship already exists!
   */
  addChild(
    onField: keyof T | string,
    child: UnknownNode,
    toField: string,
  ): { childToParentDependency: Dependency; parentToChildDependency: Dependency };

  /**
   * To add a behavior on self to order multiple actions of self.
   *
   * @param behaviors
   */
  addFieldDependency(
    behaviors: { forAction: DiffAction; onAction: DiffAction; onField: keyof T | string; toField: keyof T | string }[],
  ): void;

  /**
   * To add another node as a sibling of self.
   *
   * @param to The sibling node.
   * @returns
   * - thisToThatDependency: The dependency edge from self to sibling.
   */
  addRelationship(to: UnknownNode): { thisToThatDependency: Dependency };

  /**
   * Compares and calculates the difference between the current version of self node, and the previous version.
   * - Recursively compares self children too.
   *
   * @param previous The previous version of self.
   */
  diff(previous?: T): Promise<Diff[]>;

  /**
   * To compare properties of the current version of self node, vs. the previous version.
   * It is a helper method to the `diff()` method.
   * - This method is called by the {@link diff()} method.
   *
   * @param previous The previous version of self.
   */
  diffProperties(previous: T): Promise<Diff[]>;

  /**
   * To get all ancestors of self.
   * - Includes parent nodes.
   * - Might include sibling nodes,
   * if the dependency behaviors dictate the sibling is necessary for self node to exist.
   */
  getAncestors(): UnknownNode[];

  /**
   * To get a boundary (sub graph) of self.
   * A boundary is a group of nodes that must belong together.
   * The boundary consists of all nodes associated with self,
   * which includes parents, grand parents, children, grand children, and siblings.
   */
  getBoundaryMembers(): UnknownNode[];

  /**
   * To get a child of self that matches the given filters.
   *
   * @param name The {@link NODE_NAME} of the child.
   * @param filters A set of filters, to be applied on children,
   * where `key` is the property name and `value` is the value to filter by.
   * @throws {@link NodeError} If more than one child is found.
   */
  getChild(name: string, filters: { key: string; value: any }[]): UnknownNode | undefined;

  /**
   * To get all children of self.
   *
   * @param name The {@link NODE_NAME} of the children.
   * @returns All children as an object with the {@link NODE_NAME} as the key,
   * and self's dependency to the child as the value.
   */
  getChildren(name?: string): { [key: string]: Dependency[] };

  /**
   * To get the context of self.
   * A context is a string representation of self that uniquely identifies self in the graph.
   */
  getContext(): string;

  /**
   * To get all dependencies of self.
   * - Can be filtered to just dependencies with a single node.
   *
   * @param to The other node. If present, will only return dependencies of self with this node.
   */
  getDependencies(to?: UnknownNode): Dependency[];

  /**
   * To get a dependency of self with another node.
   *
   * @param to The other node.
   * @param relationship The relationship between self and the other node.
   * @returns The dependency with the other node having the given relationship, or `undefined` if not found.
   */
  getDependency(to: UnknownNode, relationship: DependencyRelationship): Dependency | undefined;

  /**
   * To get the index of a dependency of self with another node.
   *
   * @param to The other node.
   * @param relationship The relationship between self and the other node.
   * @returns The index of the dependency with the other node having the given relationship, or `-1` if not found.
   */
  getDependencyIndex(to: UnknownNode, relationship: DependencyRelationship): number;

  /**
   * To get all parent of self.
   *
   * @param name The {@link NODE_NAME} of the parent.
   * @returns All parents as an object with the {@link NODE_NAME} as the key,
   * and self's dependency to the parent as the value.
   */
  getParents(name?: string): { [key: string]: Dependency[] };

  /**
   * To get all siblings of self.
   *
   * @param name The {@link NODE_NAME} of the sibling.
   * @returns All siblings as an object with the {@link NODE_NAME} as the key,
   * and self's dependency to the sibling as the value.
   */
  getSiblings(name?: string): { [key: string]: Dependency[] };

  /**
   * To check if given node is an ancestor of self.
   *
   * @param node The other node.
   */
  hasAncestor(node: UnknownNode): boolean;

  /**
   * To remove a dependency from self.
   *
   * @param dependencyIndex The index of the dependency to remove.
   */
  removeDependency(dependencyIndex: number): void;

  /**
   * To remove ALL dependencies from self for the given node.
   *
   * @param node The other node.
   */
  removeRelationship(node: UnknownNode): void;

  /**
   * To set the context of self.
   * A context is a string representation of self that uniquely identifies self in the graph.
   */
  setContext(): string;

  /**
   * Generates a serializable representation of self.
   */
  synth(): S;
}

/**
 * Node Reference encapsulates identification information of self.
 */
export interface INodeReference {
  context: string;
}
