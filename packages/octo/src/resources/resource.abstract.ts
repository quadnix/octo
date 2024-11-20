import { NodeType, type ResourceSchema, type UnknownNode, type UnknownResource } from '../app.type.js';
import { DiffInverseResourceError, RemoveResourceError, ResourceError } from '../errors/index.js';
import { type Dependency, DependencyRelationship } from '../functions/dependency/dependency.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { ANode } from '../functions/node/node.abstract.js';
import type { IResource } from './resource.interface.js';
import type { BaseResourceSchema } from './resource.schema.js';
import type { ASharedResource } from './shared-resource.abstract.js';

export abstract class AResource<S extends BaseResourceSchema, T extends UnknownResource>
  extends ANode<S, T>
  implements IResource<S, T>
{
  private _deleteMarker = false;

  readonly response: S['response'] = {};

  protected constructor(
    readonly resourceId: S['resourceId'],
    readonly properties: S['properties'],
    parents: UnknownResource[],
  ) {
    super();

    for (const parent of parents) {
      parent.addChild('resourceId', this, 'resourceId');
    }
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

  clonePropertiesInPlace(sourceResource: T): void {
    for (const key of Object.keys(this.properties)) {
      delete this.properties[key];
    }
    for (const key of Object.keys(sourceResource.properties) as (keyof S['properties'])[]) {
      this.properties[key] = JSON.parse(JSON.stringify(sourceResource.properties[key]));
    }
  }

  static async cloneResource<T extends UnknownResource>(
    sourceResource: T,
    deReferenceResource: (context: string) => Promise<UnknownResource>,
  ): Promise<T> {
    const resource: BaseResourceSchema = {
      properties: JSON.parse(JSON.stringify(sourceResource.properties)),
      resourceId: sourceResource.resourceId,
      response: JSON.parse(JSON.stringify(sourceResource.response)),
    };

    const parentContexts = await Promise.all(
      Object.values(sourceResource.getParents())
        .flat()
        .map((d) => (d.to as UnknownResource).getContext()),
    );

    const deserializationClass = sourceResource.constructor as any;
    return deserializationClass.unSynth(deserializationClass, resource, parentContexts, deReferenceResource);
  }

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

    // From source resource, get all dependencies from source to its parents.
    const sourceChildToParentDependencies = Object.values(sourceResource.getParents()).flat();

    // Clone each of those dependencies.
    for (const sourceChildToParentDependency of sourceChildToParentDependencies) {
      const parent = await deReferenceResource((sourceChildToParentDependency.to as UnknownResource).getContext());
      const { childToParentDependency, parentToChildDependency } = parent.addChild('resourceId', this, 'resourceId');

      // Clone behaviors from source to its parent.
      for (const b of sourceChildToParentDependency.synth().behaviors) {
        childToParentDependency.addBehavior(b.onField, b.onAction, b.toField, b.forAction);
      }

      // Clone behaviors from parent to source.
      const sourceParentToChildDependency = sourceChildToParentDependency.to.getDependency(
        sourceChildToParentDependency.from,
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
  }

  cloneResponseInPlace(sourceResource: UnknownResource): void {
    for (const key of Object.keys(this.response)) {
      delete this.response[key];
    }
    for (const key of Object.keys(sourceResource.response) as (keyof S['response'])[]) {
      this.response[key] = JSON.parse(JSON.stringify(sourceResource.response[key]));
    }
  }

  // @ts-expect-error since this overridden diff() is always called with previous.
  override async diff(previous: T | ASharedResource<S, T>): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const propertyDiffs = await this.diffProperties(previous);
    diffs.push(...propertyDiffs);

    // Parent diffs.
    const previousParents = Object.values((previous as unknown as UnknownResource).getParents())
      .flat()
      .map((d) => d.to);
    const currentParents = Object.values(this.getParents())
      .flat()
      .map((d) => d.to);
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

    return diffs;
  }

  async diffInverse(diff: Diff, deReferenceResource: (context: string) => Promise<UnknownResource>): Promise<void> {
    switch (diff.field) {
      case 'resourceId': {
        if (diff.action === DiffAction.DELETE) {
          this.remove();
        } else {
          throw new DiffInverseResourceError('Unknown action on "resourceId" field during diff inverse!', this, diff);
        }
        return;
      }
      case 'parent': {
        if (diff.action === DiffAction.ADD || diff.action === DiffAction.DELETE) {
          await this.cloneResourceInPlace(diff.node as T, deReferenceResource);
        } else {
          throw new DiffInverseResourceError('Unknown action on "parent" field during diff inverse!', this, diff);
        }
        return;
      }
      case 'properties': {
        if (diff.action === DiffAction.ADD || diff.action === DiffAction.UPDATE) {
          const change = diff.value as { key: keyof S['properties']; value: any };
          this.properties[change.key] = JSON.parse(JSON.stringify(change.value));
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
      default: {
        throw new DiffInverseResourceError('Unknown field during diff inverse!', this, diff);
      }
    }
  }

  override async diffProperties(previous: T | ASharedResource<S, T>): Promise<Diff[]> {
    return DiffUtility.diffObject(previous as unknown as UnknownResource, this, 'properties');
  }

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
   * @deprecated Boundary is not supported in resources!
   */
  override getBoundaryMembers(): UnknownNode[] {
    throw new ResourceError('Boundary is not supported in resources!', this);
  }

  getSharedResource(): ASharedResource<S, T> | undefined {
    const sameNodeDependencies = this.getChildren()[(this.constructor as typeof AResource).NODE_NAME];
    const sharedResourceDependency = sameNodeDependencies?.find(
      (d) => (d.to.constructor as typeof AResource).NODE_TYPE === NodeType.SHARED_RESOURCE,
    );
    return sharedResourceDependency?.to as ASharedResource<S, T>;
  }

  /**
   * @deprecated Siblings are not supported in resources!
   */
  override getSiblings(): { [p: string]: Dependency[] } {
    throw new ResourceError('Siblings are not supported in resources!', this);
  }

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

  isMarkedDeleted(): boolean {
    return this._deleteMarker;
  }

  remove(): void {
    const dependencies = this.getDependencies();

    // Verify resource can be removed.
    const children = dependencies.filter((d) => d.isParentRelationship()).map((d) => d.to);
    if (children.length > 0) {
      throw new RemoveResourceError(
        'Cannot remove resource until dependent nodes exist!',
        this,
        children as UnknownResource[],
      );
    }

    // Removing all dependencies that points to this.
    for (const dependency of dependencies) {
      const index = dependency.to.getDependencies().findIndex((d) => d.to.getContext() === this.getContext());
      dependency.to.removeDependency(index);
    }

    this._deleteMarker = true;
  }

  override setContext(): string {
    const nodePackage = (this.constructor as typeof AResource).NODE_PACKAGE;
    const nodeName = (this.constructor as typeof AResource).NODE_NAME;
    return `${nodePackage}/${nodeName}=${this.resourceId}`;
  }

  override synth(): S {
    return {
      properties: JSON.parse(JSON.stringify(this.properties)),
      resourceId: this.resourceId,
      response: JSON.parse(JSON.stringify(this.response)),
    } as S;
  }

  static override async unSynth(
    deserializationClass: any,
    resource: ResourceSchema<UnknownResource>,
    parentContexts: string[],
    deReferenceResource: (context: string) => Promise<UnknownResource>,
  ): Promise<UnknownResource> {
    const parents = await Promise.all(parentContexts.map((p) => deReferenceResource(p)));
    const newResource = new deserializationClass(resource.resourceId, resource.properties, parents);
    for (const key of Object.keys(resource.response)) {
      newResource.response[key] = resource.response[key];
    }
    return newResource;
  }
}
