import type { UnknownModel, UnknownNode, UnknownResource } from '../app.type.js';
import type { Dependency, IDependency } from '../functions/dependency/dependency.js';
import type { Diff } from '../functions/diff/diff.js';

export class DependencyError extends Error {
  readonly dependency: IDependency;

  constructor(message: string, dependency: Dependency) {
    super(message);

    this.dependency = dependency.synth();

    Object.setPrototypeOf(this, DependencyError.prototype);
  }
}

export class ModelError extends Error {
  readonly model: string;

  constructor(message: string, model: UnknownModel) {
    super(message);

    this.model = model.NODE_NAME;

    Object.setPrototypeOf(this, ModelError.prototype);
  }
}

export class NodeError extends Error {
  readonly node: string;

  constructor(message: string, node: UnknownNode) {
    super(message);

    this.node = node.NODE_NAME;

    Object.setPrototypeOf(this, NodeError.prototype);
  }
}

export class ResourceError extends Error {
  readonly resource: string;

  constructor(message: string, resource: UnknownResource) {
    super(message);

    this.resource = resource.NODE_NAME;

    Object.setPrototypeOf(this, ResourceError.prototype);
  }
}

export class DiffInverseResourceError extends ResourceError {
  readonly diff: ReturnType<Diff['toJSON']>;

  constructor(message: string, resource: UnknownResource, diff: Diff) {
    super(message, resource);

    this.diff = diff.toJSON();

    Object.setPrototypeOf(this, DiffInverseResourceError.prototype);
  }
}

export class RemoveResourceError extends ResourceError {
  readonly childrenResources: string[];

  constructor(message: string, resource: UnknownResource, childrenResources: UnknownResource[]) {
    super(message, resource);

    this.childrenResources = childrenResources.map((r) => r.NODE_NAME);

    Object.setPrototypeOf(this, RemoveResourceError.prototype);
  }
}
