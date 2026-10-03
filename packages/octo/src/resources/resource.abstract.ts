import { type DiffValueTypeTagUpdate, MatchingResource, type UnknownResource } from '../app.type.js';
import { DiffInverseResourceError, RemoveResourceError, ResourceError } from '../errors/index.js';
import { type Dependency, DependencyRelationship } from '../functions/dependency/dependency.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { ANode } from '../functions/node/node.abstract.js';
import { StringUtility } from '../utilities/string/string.utility.js';
import type { IResource, IResourceReference } from './resource.interface.js';
import type { BaseResourceSchema } from './resource.schema.js';

/**
 * The base class of every resource - the nodes that describe actual cloud infrastructure.
 *
 * Where a model says *what you want*, a resource says *what exists*. Resources are never constructed
 * by you directly; a model action declares them, and Octo diffs the declared graph against the last
 * committed one to decide what to create, update, or destroy.
 *
 * A resource is identified by its `resourceId`, configured by its `properties`, and reports back
 * through its `response` once the infrastructure exists. The ID it is created with is its
 * `localResourceId`, which only has to be unique within its `scope`: where the node creating the
 * resource sits in the model graph. Octo makes the `resourceId` from the two.
 *
 * Most resources extend {@link ATerraformResource} rather than this class.
 *
 * @group Resources
 *
 * @see Definition of [Resources](/docs/fundamentals/resources).
 */
export abstract class AResource<S extends BaseResourceSchema, T extends UnknownResource>
  extends ANode<S, T>
  implements IResource<S, T>
{
  /**
   * The names this class declares unique, each by the properties whose values form its domain. Set by
   * {@link Resource}.
   *
   * @internal
   */
  static readonly UNIQUE_PROPERTIES: { path: string; within: string[] }[];

  /**
   * The scope every resource constructed now is created in. The transaction sets it around each model
   * action.
   */
  private static constructionScope: string[] = [];

  /**
   * The resources this one is built on top of. A parent is always created before its children,
   * and destroyed after them.
   */
  readonly parents: (MatchingResource<BaseResourceSchema> | UnknownResource)[] = [];

  /**
   * What the cloud provider reported back about this resource, e.g. an ARN or a generated ID.
   * It is empty until the resource has actually been created, and is what other resources read
   * when they need to reference this one.
   */
  readonly response: S['response'] = {};

  /**
   * The contexts of the models this resource is placed under, sorted. Octo derives it from the node
   * whose action created the resource; a resource created outside a model action has an empty scope.
   */
  readonly scope: string[] = [...AResource.constructionScope];

  /**
   * The tags applied to this resource. See {@link Octo.registerTags} to set them in bulk.
   */
  readonly tags: S['tags'] = {};

  /**
   * The ID of the resource, unique across the infrastructure: its `localResourceId`, followed by a
   * hash of its scope when it has one.
   */
  get resourceId(): S['resourceId'] {
    if (this.scope.length === 0) {
      return this.localResourceId;
    }
    return `${this.localResourceId}-${StringUtility.deterministicHash(this.scope).substring(0, 6)}`;
  }

  private _deleteMarker = false;

  /**
   * @param localResourceId The ID of the resource, unique within its scope.
   * @param properties The desired configuration of the resource.
   * @param parents The resources this one is built on top of.
   * @throws {@link ResourceError} If the resource ID is not alphanumeric with `-`, `_`, or `/`.
   */
  protected constructor(
    readonly localResourceId: S['localResourceId'],
    readonly properties: S['properties'],
    parents: (MatchingResource<BaseResourceSchema> | UnknownResource)[] = [],
  ) {
    super();

    if (!/^[\w-/]+$/.test(localResourceId)) {
      throw new ResourceError('Invalid resource ID!', this);
    }

    for (const parent of parents) {
      parent.addChild('resourceId', this, 'resourceId');
    }
  }

  /**
   * @internal
   */
  static async cloneResource<T extends UnknownResource>(
    sourceResource: T,
    deReferenceResource: (context: string) => Promise<UnknownResource>,
  ): Promise<T> {
    const deserializationClass = sourceResource.constructor as typeof AResource<BaseResourceSchema, T>;
    return deserializationClass.unSynth(deserializationClass, sourceResource.synth(), deReferenceResource);
  }

  /**
   * Constructs resources in the given scope.
   *
   * @internal
   */
  static constructInScope<R>(scope: string[], construct: () => R): R {
    const previousScope = AResource.constructionScope;
    AResource.constructionScope = scope;
    try {
      return construct();
    } finally {
      AResource.constructionScope = previousScope;
    }
  }

  /**
   * Runs a model action, so every resource it constructs is created in the given scope.
   * Model actions run one at a time, which is what makes the scope safe to hold statically.
   *
   * @internal
   */
  static async runInScope<R>(scope: string[], run: () => Promise<R>): Promise<R> {
    const previousScope = AResource.constructionScope;
    AResource.constructionScope = scope;
    try {
      return await run();
    } finally {
      AResource.constructionScope = previousScope;
    }
  }

  /**
   * @internal
   */
  static override async unSynth<S extends BaseResourceSchema, T>(
    deserializationClass: any,
    resource: S,
    deReferenceResource: (context: string) => Promise<UnknownResource>,
  ): Promise<T> {
    const parents = await Promise.all(resource.parents.map((p) => deReferenceResource(p.context)));

    const resourceInlineParents = parents.map((p) => {
      const parentMetadata = resource.parents.find((pm) => pm.context === p.getContext())!;
      if (parentMetadata.parentSchemaTranslator) {
        const parentSchemaTranslator = new Function('return ' + parentMetadata.parentSchemaTranslator)();
        return new MatchingResource(p, parentSchemaTranslator);
      } else {
        return p;
      }
    });

    const newResource = AResource.constructInScope(
      resource.scope || [],
      () => new deserializationClass(resource.localResourceId, resource.properties, resourceInlineParents),
    );
    for (const key of Object.keys(resource.response)) {
      newResource.response[key] = resource.response[key];
    }
    for (const key of Object.keys(resource.tags)) {
      newResource.tags[key] = resource.tags[key];
    }
    return newResource;
  }

  /**
   * @internal
   */
  override addChild(
    onField: keyof T | string,
    child: UnknownResource,
    toField: string,
  ): {
    childToParentDependency: Dependency;
    parentToChildDependency: Dependency;
  } {
    const result = super.addChild(onField, child, toField);

    // Order a child's `ADD 'parent'` after the parent's own ADD. Applying that diff runs
    // `cloneResourceInPlace`, which de-references every parent out of the *actual* resource graph,
    // and a parent only lands there once its own diff has been applied.
    //
    // `super.addChild` registers this ordering for the child's `('resourceId', ADD)` only, which
    // covers a child created alongside its parent but not one that already exists and is gaining a
    // parent - there the child has no ADD of its own, just an `ADD 'parent'`, and nothing held it back.
    result.childToParentDependency.addBehavior('parent', DiffAction.ADD, onField as string, DiffAction.ADD);

    if (
      child.parents.findIndex((p) =>
        p instanceof MatchingResource
          ? p.getActual().getContext() === this.getContext()
          : p.getContext() === this.getContext(),
      ) === -1
    ) {
      child.parents.push(this);
    }

    return result;
  }

  /**
   * @deprecated Field dependencies are not supported in resources!
   */
  override addFieldDependency(): void {
    throw new ResourceError('Field dependencies are not supported in resources!', this);
  }

  /**
   * @deprecated Relationships are not supported in resources!
   */
  override addRelationship(): { thatToThisDependency: Dependency; thisToThatDependency: Dependency } {
    throw new ResourceError('Relationships are not supported in resources!', this);
  }

  /**
   * @internal
   */
  clonePropertiesInPlace(sourceResource: T): void {
    for (const key of Object.keys(this.properties)) {
      delete this.properties[key];
    }
    for (const key of Object.keys(sourceResource.properties) as (keyof S['properties'])[]) {
      this.properties[key] =
        sourceResource.properties[key] === undefined
          ? undefined
          : JSON.parse(JSON.stringify(sourceResource.properties[key]));
    }
  }

  /**
   * @internal
   */
  async cloneResourceInPlace(
    sourceResource: T,
    deReferenceResource: (context: string) => Promise<UnknownResource>,
  ): Promise<void> {
    // Remove all dependencies from self.
    const selfParents = Object.values(this.getParents())
      .flat()
      .map((d) => d.to as UnknownResource);
    for (const parent of selfParents) {
      this.removeRelationship(parent);
    }
    // Empty inline parents.
    this.parents.splice(0, this.parents.length);

    // From source resource, copy all parents.
    for (const sourceParent of sourceResource.parents) {
      const sourceParentActual = sourceParent instanceof MatchingResource ? sourceParent.getActual() : sourceParent;

      const parent = await deReferenceResource(sourceParentActual.getContext());
      const parentMatching =
        sourceParent instanceof MatchingResource ? new MatchingResource(parent, sourceParent.schemaTranslator) : parent;
      const { childToParentDependency, parentToChildDependency } = parentMatching.addChild(
        'resourceId',
        this,
        'resourceId',
      );

      // Clone behaviors from source to its parent.
      const sourceChildToParentDependency = sourceResource.getDependency(
        sourceParentActual,
        DependencyRelationship.CHILD,
      )!;
      for (const b of sourceChildToParentDependency.synth().behaviors) {
        childToParentDependency.addBehavior(b.onField, b.onAction, b.toField, b.forAction);
      }

      // Clone behaviors from parent to source.
      const sourceParentToChildDependency = sourceParentActual.getDependency(
        sourceResource,
        DependencyRelationship.PARENT,
      )!;
      for (const b of sourceParentToChildDependency.synth().behaviors) {
        parentToChildDependency.addBehavior(b.onField, b.onAction, b.toField, b.forAction);
      }
    }

    // Replace properties.
    this.clonePropertiesInPlace(sourceResource);
    // Replace responses.
    this.cloneResponseInPlace(sourceResource);
    // Replace tags.
    this.cloneTagsInPlace(sourceResource);
  }

  /**
   * @internal
   */
  cloneResponseInPlace(sourceResource: UnknownResource): void {
    for (const key of Object.keys(this.response)) {
      delete this.response[key];
    }
    for (const key of Object.keys(sourceResource.response) as (keyof S['response'])[]) {
      this.response[key] =
        sourceResource.response[key] === undefined
          ? undefined
          : JSON.parse(JSON.stringify(sourceResource.response[key]));
    }
  }

  /**
   * @internal
   */
  cloneTagsInPlace(sourceResource: UnknownResource): void {
    for (const key of Object.keys(this.tags)) {
      delete this.tags[key];
    }
    for (const key of Object.keys(sourceResource.tags) as (keyof S['tags'])[]) {
      this.tags[key] = sourceResource.tags[key];
    }
  }

  /**
   * @internal
   */
  override async diff(previous: T): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const propertyDiffs = await this.diffProperties(previous);
    diffs.push(...propertyDiffs);

    const tagDiffs = await this.diffTags(previous);
    diffs.push(...tagDiffs);

    // Parent diffs.
    const previousParents = Object.values((previous as unknown as UnknownResource).getParents())
      .flat()
      .map((d) => d.to as UnknownResource);
    const currentParents = Object.values(this.getParents())
      .flat()
      .map((d) => d.to as UnknownResource);
    const deletedParents = previousParents.filter(
      (p) => currentParents.findIndex((c) => c.getContext() === p.getContext()) === -1,
    );

    for (const parent of deletedParents) {
      diffs.push(new Diff(this, DiffAction.DELETE, 'parent', parent));
    }

    const newParents = currentParents.filter(
      (c) => previousParents.findIndex((p) => p.getContext() === c.getContext()) === -1,
    );

    for (const parent of newParents) {
      diffs.push(new Diff(this, DiffAction.ADD, 'parent', parent));
    }

    // Deep-compare the parent's whole object rather than delegating to its `diffProperties()`. A
    // parent that excludes a field the child renders would otherwise produce no octo diff anywhere
    // while terraform plans a change on the child, which validate would report as drift.
    for (const currentParent of currentParents) {
      const previousParent = previousParents.find((p) => p.getContext() === currentParent.getContext());
      if (previousParent && !DiffUtility.isObjectDeepEquals(currentParent, previousParent, ['tags'])) {
        diffs.push(new Diff(this, DiffAction.UPDATE, 'parent', currentParent));
      }
    }

    return diffs;
  }

  /**
   * @internal
   */
  async diffInverse(diff: Diff, deReferenceResource: (context: string) => Promise<UnknownResource>): Promise<void> {
    if (diff.action === DiffAction.VALIDATE) {
      return;
    }

    switch (diff.field) {
      case 'resourceId': {
        if (diff.action === DiffAction.DELETE) {
          this.remove(true);
        } else {
          throw new DiffInverseResourceError('Unknown action on "resourceId" field during diff inverse!', this, diff);
        }
        return;
      }
      case 'parent': {
        if (diff.action === DiffAction.ADD || diff.action === DiffAction.DELETE) {
          // Unlike properties, by default we copy all parents in one shot!
          // If the custom resource wants to apply each parent individually, they must override diffInverse()
          // with their custom logic.
          await this.cloneResourceInPlace(diff.node as T, deReferenceResource);
        } else if (diff.action === DiffAction.UPDATE) {
          // Do nothing, since the parent of this resource has been updated,
          // but this resource has no changes relevant to the parent.
        } else {
          throw new DiffInverseResourceError('Unknown action on "parent" field during diff inverse!', this, diff);
        }
        return;
      }
      case 'properties': {
        if (diff.action === DiffAction.ADD || diff.action === DiffAction.UPDATE) {
          const change = diff.value as { key: keyof S['properties']; value: any };
          this.properties[change.key] =
            change.value === undefined ? undefined : JSON.parse(JSON.stringify(change.value));
        } else if (diff.action === DiffAction.DELETE) {
          const change = diff.value as { key: string; value: any };
          delete this.properties[change.key];
        } else {
          throw new DiffInverseResourceError('Unknown action on "properties" field during diff inverse!', this, diff);
        }

        // Replace response.
        this.cloneResponseInPlace(diff.node as UnknownResource);

        return;
      }
      case 'tags': {
        if (diff.action === DiffAction.UPDATE) {
          const diffValue = diff.value as DiffValueTypeTagUpdate;
          if (diffValue.delete) {
            for (const key of diffValue.delete) {
              delete this.tags[key];
            }
          }
          if (diffValue.add) {
            for (const [key, value] of Object.entries(diffValue.add)) {
              (this.tags as BaseResourceSchema['tags'])[key] = value;
            }
          }
          if (diffValue.update) {
            for (const [key, value] of Object.entries(diffValue.update)) {
              (this.tags as BaseResourceSchema['tags'])[key] = value;
            }
          }
        } else {
          throw new DiffInverseResourceError('Unknown action on "tags" field during diff inverse!', this, diff);
        }

        return;
      }
      default: {
        throw new DiffInverseResourceError('Unknown field during diff inverse!', this, diff);
      }
    }
  }

  /**
   * @internal
   */
  override async diffProperties(previous: T): Promise<Diff[]> {
    return DiffUtility.diffObject(previous as unknown as UnknownResource, this, 'properties');
  }

  /**
   * @internal
   */
  async diffTags(previous: T): Promise<Diff<UnknownResource, DiffValueTypeTagUpdate>[]> {
    const tagsToAdd: { [key: string]: string } = {};
    const tagsToDelete: string[] = [];
    const tagsToUpdate: { [key: string]: string } = {};

    for (const [key, value] of Object.entries(previous.tags)) {
      if (!Object.prototype.hasOwnProperty.call(this.tags, key)) {
        tagsToDelete.push(key);
      } else if (this.tags[key] !== value) {
        tagsToUpdate[key] = this.tags[key];
      }
    }
    for (const [key, value] of Object.entries(this.tags)) {
      if (!Object.prototype.hasOwnProperty.call(previous.tags, key)) {
        tagsToAdd[key] = value;
      }
    }

    if (Object.keys(tagsToAdd).length === 0 && tagsToDelete.length === 0 && Object.keys(tagsToUpdate).length === 0) {
      return [];
    }
    return [new Diff(this, DiffAction.UPDATE, 'tags', { add: tagsToAdd, delete: tagsToDelete, update: tagsToUpdate })];
  }

  /**
   * Splits one diff into the diffs a resource action will actually receive.
   *
   * Override it when a single change on this resource has to be applied as several ordered steps.
   * The default returns the diff unchanged.
   */
  diffUnpack(diff: Diff): Diff[] {
    return [diff];
  }

  /**
   * To find this resource's parents whose properties match every given filter.
   *
   * @param filters Each filter is a property `key` the parent must carry with the given `value`.
   */
  findParentsByProperty(filters: { key: string; value: unknown }[]): UnknownResource[] {
    const parents: UnknownResource[] = [];
    const dependencies = Object.values(this.getParents()).flat();
    for (const d of dependencies) {
      const resource = d.to as UnknownResource;
      if (filters.every((c) => resource.properties[c.key] === c.value)) {
        parents.push(resource);
      }
    }
    return parents;
  }

  /**
   * To find this resource's parents whose tags match every given filter.
   *
   * @param filters Each filter is a tag `key` the parent must carry with the given `value`.
   */
  findParentsByTag(filters: { key: string; value: string }[]): UnknownResource[] {
    const parents: UnknownResource[] = [];
    const dependencies = Object.values(this.getParents()).flat();
    for (const d of dependencies) {
      const resource = d.to as UnknownResource;
      if (filters.every((c) => resource.tags[c.key] === c.value)) {
        parents.push(resource);
      }
    }
    return parents;
  }

  /**
   * @deprecated Boundary is not supported in resources!
   */
  override getBoundaryMembers(): UnknownResource[] {
    throw new ResourceError('Boundary is not supported in resources!', this);
  }

  /**
   * The properties whose change means an external resource has to be run again. Terraform hashes
   * them into the trigger of the `null_resource` that stands in for the resource, which is how it
   * decides to call back.
   *
   * A resource that overrides {@link diffProperties} to ignore a property must exclude that property
   * here too. The two answer the same question, and terraform plans a replacement for any property
   * only this one covers, which octo then reports no change for.
   */
  getExternalTriggerProperties(): Partial<S['properties']> {
    return this.properties;
  }

  /**
   * @deprecated Siblings are not supported in resources!
   */
  override getSiblings(): { [p: string]: Dependency[] } {
    throw new ResourceError('Siblings are not supported in resources!', this);
  }

  /**
   * @internal
   */
  isDeepEquals(other?: UnknownResource): boolean {
    if (!other) {
      return false;
    }

    if (!DiffUtility.isObjectDeepEquals(this.synth(), other.synth())) {
      return false;
    }

    if (this.isMarkedDeleted() !== other.isMarkedDeleted()) {
      return false;
    }

    const selfDependencies = Object.values(this.getParents()).flat();
    const otherDependencies = Object.values(other.getParents()).flat();
    return selfDependencies.every((sd) => {
      const od = otherDependencies.find((od) => od.isEqual(sd));
      if (!DiffUtility.isObjectDeepEquals(sd.synth(), od?.synth() || {})) {
        return false;
      }

      const sdPd = sd.to.getDependency(sd.from, DependencyRelationship.PARENT)!;
      const odPd = od!.to.getDependency(od!.from, DependencyRelationship.PARENT)!;
      return DiffUtility.isObjectDeepEquals(sdPd.synth(), odPd.synth());
    });
  }

  /**
   * Whether this resource is marked for deletion, and will leave the graph at the end of the transaction.
   */
  isMarkedDeleted(): boolean {
    return this._deleteMarker;
  }

  /**
   * To mark this resource for deletion. It leaves the graph at the end of the transaction.
   *
   * @param force Removes the resource even if other resources still depend on it.
   * @throws {@link RemoveResourceError} If the resource still has children, and `force` is not set.
   */
  remove(force: boolean = false): void {
    const dependencies = this.getDependencies();

    // Verify resource can be removed.
    if (!force) {
      const children = dependencies.filter((d) => d.isParentRelationship()).map((d) => d.to);
      if (children.length > 0) {
        throw new RemoveResourceError(
          'Cannot remove resource until dependent nodes exist!',
          this,
          children as UnknownResource[],
        );
      }
    }

    // Removing all dependencies that points to this.
    for (const dependency of dependencies) {
      const index = dependency.to.getDependencies().findIndex((d) => d.to.getContext() === this.getContext());
      dependency.to.removeDependency(index);
    }

    this._deleteMarker = true;
  }

  /**
   * @internal
   */
  override setContext(): string {
    const nodePackage = (this.constructor as typeof AResource).NODE_PACKAGE;
    const nodeName = (this.constructor as typeof AResource).NODE_NAME;
    return `${nodePackage}/${nodeName}=${this.resourceId}`;
  }

  /**
   * To record what the cloud provider reported back about this resource.
   * Keys absent from `response` are left as they were.
   */
  setResponse(response: S['response']): void {
    for (const key of Object.keys(response || {}) as (keyof S['response'])[]) {
      this.response[key] = response[key] === undefined ? undefined : JSON.parse(JSON.stringify(response[key]));
    }
  }

  /**
   * @internal
   */
  override synth(): S {
    const resourceSynth: BaseResourceSchema = {
      localResourceId: this.localResourceId,
      parents: this.parents.map((p) => {
        const parentReference: IResourceReference = {
          context: p instanceof MatchingResource ? p.getActual().getContext() : p.getContext(),
        };
        if (p instanceof MatchingResource) {
          parentReference.parentSchemaTranslator = p.hasSchemaTranslator()
            ? p.schemaTranslator!.toString()
            : ((synth: BaseResourceSchema): BaseResourceSchema => synth).toString();
        }
        return parentReference;
      }),
      properties: JSON.parse(JSON.stringify(this.properties)),
      resourceId: this.resourceId,
      response: JSON.parse(JSON.stringify(this.response)),
      scope: [...this.scope],
      tags: JSON.parse(JSON.stringify(this.tags)),
    };
    return resourceSynth as S;
  }
}
