import type { UnknownModel, UnknownNode, UnknownOverlay, UnknownResource } from '../app.type.js';
import type { Dependency, IDependency } from '../functions/dependency/dependency.js';
import type { Diff } from '../functions/diff/diff.js';
import type { ANode } from '../functions/node/node.abstract.js';
import type { AResource } from '../resources/resource.abstract.js';

/**
 * @group Errors/Node
 */
export class DependencyError extends Error {
  readonly dependency: IDependency;

  constructor(message: string, dependency: Dependency) {
    super(message);

    this.dependency = dependency.synth();

    Object.setPrototypeOf(this, DependencyError.prototype);
  }
}

/**
 * @group Errors/Node
 */
export class NodeUnsynthError extends Error {
  readonly subject: string;

  constructor(message: string, subject: string) {
    super(message);

    this.subject = subject;

    Object.setPrototypeOf(this, NodeUnsynthError.prototype);
  }
}

/**
 * @group Errors/Node
 */
export class NodeError extends Error {
  readonly node: string;

  constructor(message: string, node: typeof AResource | UnknownNode) {
    super(message);

    this.node = (node as unknown as typeof ANode).NODE_NAME || (node.constructor as typeof ANode).NODE_NAME;

    Object.setPrototypeOf(this, NodeError.prototype);
  }
}

/**
 * @group Errors/Node
 */
export class ContextNodeError extends NodeError {
  constructor(message: string, node: UnknownNode) {
    super(message, node);

    Object.setPrototypeOf(this, ContextNodeError.prototype);
  }
}

/**
 * @group Errors/Node
 */
export class ModelError extends NodeError {
  constructor(message: string, model: UnknownModel) {
    super(message, model);

    Object.setPrototypeOf(this, ModelError.prototype);
  }
}

/**
 * @group Errors/Node
 */
export class OverlayError extends NodeError {
  constructor(message: string, overlay: UnknownOverlay) {
    super(message, overlay);

    Object.setPrototypeOf(this, OverlayError.prototype);
  }
}

/**
 * @group Errors/Node
 */
export class ResourceError extends NodeError {
  constructor(message: string, resource: typeof AResource | UnknownResource) {
    super(message, resource);

    Object.setPrototypeOf(this, ResourceError.prototype);
  }
}

/**
 * @group Errors/Node
 */
export class DiffInverseResourceError extends ResourceError {
  readonly diff: ReturnType<Diff['toJSON']>;

  constructor(message: string, resource: UnknownResource, diff: Diff) {
    super(message, resource);

    this.diff = diff.toJSON();

    Object.setPrototypeOf(this, DiffInverseResourceError.prototype);
  }
}

/**
 * @group Errors/Node
 */
export class RemoveResourceError extends ResourceError {
  readonly childrenResources: string[];

  constructor(message: string, resource: UnknownResource, childrenResources: UnknownResource[]) {
    super(message, resource);

    this.childrenResources = childrenResources.map((r) => (r.constructor as typeof ANode).NODE_NAME);

    Object.setPrototypeOf(this, RemoveResourceError.prototype);
  }
}
