import type { UnknownResource } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';
import type { INode, INodeReference } from '../functions/node/node.interface.js';
import type { AResource } from './resource.abstract.js';
import type { BaseResourceSchema } from './resource.schema.js';

export interface IResource<S extends BaseResourceSchema, T extends UnknownResource> extends INode<S, T> {
  clonePropertiesInPlace(sourceResource: T): void;

  cloneResourceInPlace(
    sourceResource: T,
    deReferenceResource: (context: string) => Promise<UnknownResource>,
  ): Promise<void>;

  cloneResponseInPlace(sourceResource: T): void;

  cloneTagsInPlace(sourceResource: T): void;

  diffInverse(diff: Diff, deReferenceResource: (context: string) => Promise<UnknownResource>): Promise<void>;

  diffTags(previous: T): Promise<Diff[]>;

  diffUnpack(diff: Diff): Diff[];

  findParentsByProperty(filters: { key: string; value: unknown }[]): UnknownResource[];

  findParentsByTag(filters: { key: string; value: string }[]): UnknownResource[];

  isDeepEquals(other?: UnknownResource): boolean;

  /**
   * To check if self is marked as deleted.
   * A deleted node will be removed from the graph after the transaction.
   */
  isMarkedDeleted(): boolean;

  merge(previous: AResource<S, T>): AResource<S, T>;

  /**
   * To mark self as deleted.
   * A deleted node will be removed from the graph after the transaction.
   * - A node cannot be deleted if it has dependencies.
   *
   * @throws {@link RemoveResourceError} If node contains dependencies to other nodes.
   */
  remove(): void;
}

export interface IResourceReference extends INodeReference {
  parentSchemaTranslator?: string;
}
