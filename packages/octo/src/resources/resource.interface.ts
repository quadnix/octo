import type { UnknownResource } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';
import type { INode, INodeReference } from '../functions/node/node.interface.js';
import type { BaseResourceSchema } from './resource.schema.js';
import type { ASharedResource } from './shared-resource.abstract.js';

export interface IResource<S extends BaseResourceSchema, T extends UnknownResource> extends INode<S, T> {
  clonePropertiesInPlace(sourceResource: T): void;

  cloneResourceInPlace(
    sourceResource: T,
    deReferenceResource: (context: string) => Promise<UnknownResource>,
  ): Promise<void>;

  cloneResponseInPlace(sourceResource: T): void;

  diffInverse(diff: Diff, deReferenceResource: (context: string) => Promise<UnknownResource>): Promise<void>;

  findParentsByProperty(filters: { key: string; value: unknown }[]): UnknownResource[];

  getSharedResource(): ASharedResource<S, T> | undefined;

  isDeepEquals(other?: UnknownResource): boolean;

  /**
   * To check if self is marked as deleted.
   * A deleted node will be removed from the graph after the transaction.
   */
  isMarkedDeleted(): boolean;

  /**
   * To mark self as deleted.
   * A deleted node will be removed from the graph after the transaction.
   * - A node cannot be deleted if it has dependencies.
   *
   * @throws {@link RemoveResourceError} If node contains dependencies to other nodes.
   */
  remove(): void;
}

export interface IResourceReference extends INodeReference {}
