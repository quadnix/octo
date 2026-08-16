import type { UnknownModel, UnknownNode, UnknownOverlay, UnknownResource } from '../app.type.js';
import type { Dependency, IDependency } from '../functions/dependency/dependency.js';
import type { Diff } from '../functions/diff/diff.js';
import type { ANode } from '../functions/node/node.abstract.js';
import type { AResource } from '../resources/resource.abstract.js';

/**
 * Thrown when a {@link Dependency} is given a second relationship, or asked to drop a behavior it does not have.
 *
 * @group Errors/Node
 */
export class DependencyError extends Error {
  readonly dependency: IDependency;

  /**
   * @param message The error message.
   * @param dependency The dependency that was being changed.
   */
  constructor(message: string, dependency: Dependency) {
    super(message);

    this.dependency = dependency.synth();

    Object.setPrototypeOf(this, DependencyError.prototype);
  }
}

/**
 * Thrown when state cannot be deserialized back into a node, e.g. because it references something no longer in the graph.
 *
 * @group Errors/Node
 */
export class NodeUnsynthError extends Error {
  readonly subject: string;

  /**
   * @param message The error message.
   * @param subject The node, named by its ID, that could not be deserialized.
   */
  constructor(message: string, subject: string) {
    super(message);

    this.subject = subject;

    Object.setPrototypeOf(this, NodeUnsynthError.prototype);
  }
}

/**
 * Parent error class for all node errors.
 *
 * @group Errors/Node
 */
export class NodeError extends Error {
  readonly node: string;

  /**
   * @param message The error message.
   * @param node The node the error is about.
   */
  constructor(message: string, node: typeof AResource | UnknownNode) {
    super(message);

    this.node = (node as unknown as typeof ANode).NODE_NAME || (node.constructor as typeof ANode).NODE_NAME;

    Object.setPrototypeOf(this, NodeError.prototype);
  }
}

/**
 * Thrown when a node's context cannot be derived, which usually means it was never attached to a parent.
 *
 * @group Errors/Node
 */
export class ContextNodeError extends NodeError {
  /**
   * @param message The error message.
   * @param node The node whose context could not be derived.
   */
  constructor(message: string, node: UnknownNode) {
    super(message, node);

    Object.setPrototypeOf(this, ContextNodeError.prototype);
  }
}

/**
 * Thrown when a model is used in a way its own rules forbid, e.g. adding a child that already exists.
 *
 * @group Errors/Node
 */
export class ModelError extends NodeError {
  /**
   * @param message The error message.
   * @param model The model the error is about.
   */
  constructor(message: string, model: UnknownModel) {
    super(message, model);

    Object.setPrototypeOf(this, ModelError.prototype);
  }
}

/**
 * Thrown when an overlay is used in a way its own rules forbid.
 *
 * @group Errors/Node
 */
export class OverlayError extends NodeError {
  /**
   * @param message The error message.
   * @param overlay The overlay the error is about.
   */
  constructor(message: string, overlay: UnknownOverlay) {
    super(message, overlay);

    Object.setPrototypeOf(this, OverlayError.prototype);
  }
}

/**
 * Thrown when a resource is used in a way its own rules forbid, e.g. an invalid resource ID.
 *
 * @group Errors/Node
 */
export class ResourceError extends NodeError {
  /**
   * @param message The error message.
   * @param resource The resource the error is about.
   */
  constructor(message: string, resource: typeof AResource | UnknownResource) {
    super(message, resource);

    Object.setPrototypeOf(this, ResourceError.prototype);
  }
}

/**
 * Thrown when a diff cannot be applied back onto a resource, because its field or action is not one the resource knows how to handle.
 *
 * @group Errors/Node
 */
export class DiffInverseResourceError extends ResourceError {
  readonly diff: ReturnType<Diff['toJSON']>;

  /**
   * @param message The error message.
   * @param resource The resource the diff was being applied to.
   * @param diff The diff that could not be applied.
   */
  constructor(message: string, resource: UnknownResource, diff: Diff) {
    super(message, resource);

    this.diff = diff.toJSON();

    Object.setPrototypeOf(this, DiffInverseResourceError.prototype);
  }
}

/**
 * Thrown when a resource is removed while other resources still depend on it. Carries the children that blocked it.
 *
 * @group Errors/Node
 */
export class RemoveResourceError extends ResourceError {
  readonly childrenResources: string[];

  /**
   * @param message The error message.
   * @param resource The resource that could not be removed.
   * @param childrenResources The resources still depending on it.
   */
  constructor(message: string, resource: UnknownResource, childrenResources: UnknownResource[]) {
    super(message, resource);

    this.childrenResources = childrenResources.map((r) => (r.constructor as typeof ANode).NODE_NAME);

    Object.setPrototypeOf(this, RemoveResourceError.prototype);
  }
}
