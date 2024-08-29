import { NodeType, type UnknownResource } from '../app.type.js';
import { type Dependency, DependencyRelationship } from '../functions/dependency/dependency.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { ANode } from '../functions/node/node.abstract.js';
import type { IResource } from './resource.interface.js';
import type { ASharedResource } from './shared-resource.abstract.js';

export abstract class AResource<T> extends ANode<IResource, T> {
  abstract override readonly NODE_NAME: string;
  override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

  private _deleteMarker = false;

  readonly response: IResource['response'] = {};

  protected constructor(
    readonly resourceId: IResource['resourceId'],
    readonly properties: IResource['properties'],
    parents: UnknownResource[],
  ) {
    super();

    for (const parent of parents) {
      parent.addChild('resourceId', this, 'resourceId');
    }
  }

  override addRelationship(): { thatToThisDependency: Dependency; thisToThatDependency: Dependency } {
    throw new Error('Relationships are not supported in resources!');
  }

  async cloneResourceFromAnotherGraphTree(
    sourceResource: UnknownResource,
    deReferenceResource: (resourceId: string) => Promise<UnknownResource>,
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
      const parent = await deReferenceResource((sourceChildToParentDependency.to as UnknownResource).resourceId);
      const { childToParentDependency, parentToChildDependency } = parent.addChild('resourceId', this, 'resourceId');

      // Clone behaviours from source to its parent.
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

    // Clone properties.
    for (const key of Object.keys(sourceResource.properties)) {
      this.properties[key] = JSON.parse(JSON.stringify(sourceResource.properties[key]));
    }

    // Clone responses.
    for (const key of Object.keys(sourceResource.response)) {
      this.response[key] = JSON.parse(JSON.stringify(sourceResource.response[key]));
    }
  }

  // @ts-expect-error since this overridden diff() is always called with previous.
  override async diff(previous: T | ASharedResource<T>): Promise<Diff[]> {
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

  async diffInverse(diff: Diff, deReferenceResource: (resourceId: string) => Promise<UnknownResource>): Promise<void> {
    switch (diff.field) {
      case 'resourceId': {
        if (diff.action === DiffAction.ADD) {
          await this.cloneResourceFromAnotherGraphTree(diff.node as UnknownResource, deReferenceResource);
        } else if (diff.action === DiffAction.DELETE) {
          this.remove();
        } else {
          throw new Error('Unknown action on "resourceId" field during diff inverse!');
        }
        return;
      }
      case 'parent': {
        if (diff.action === DiffAction.ADD || diff.action === DiffAction.DELETE) {
          await this.cloneResourceFromAnotherGraphTree(diff.node as UnknownResource, deReferenceResource);
        } else {
          throw new Error('Unknown action on "parent" field during diff inverse!');
        }
        return;
      }
      case 'properties': {
        if (diff.action === DiffAction.ADD || diff.action === DiffAction.UPDATE) {
          this.properties[diff.field] = JSON.parse(JSON.stringify(diff.value));
        } else if (diff.action === DiffAction.DELETE) {
          delete this.properties[diff.field];
        } else {
          throw new Error('Unknown action on "properties" field during diff inverse!');
        }

        for (const key of Object.keys((diff.node as UnknownResource).response)) {
          this.response[key] = JSON.parse(JSON.stringify((diff.node as UnknownResource).response[key]));
        }
        return;
      }
      default: {
        throw new Error('Unknown field during diff inverse!');
      }
    }
  }

  override async diffProperties(previous: T | ASharedResource<T>): Promise<Diff[]> {
    return DiffUtility.diffObject(previous as unknown as UnknownResource, this, 'properties');
  }

  getSharedResource(): ASharedResource<T> | undefined {
    const sameNodeDependencies = this.getChildren(this.NODE_NAME)[this.NODE_NAME];
    const sharedResourceDependency = sameNodeDependencies?.find((d) => d.to.NODE_TYPE === NodeType.SHARED_RESOURCE);
    return sharedResourceDependency?.to as ASharedResource<T>;
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
   *
   * @throws {@link Error} If node contains dependencies to other nodes.
   */
  remove(): void {
    const dependencies = this.getDependencies();

    // Verify resource can be removed.
    if (dependencies.some((d) => d.isParentRelationship())) {
      throw new Error('Cannot remove resource until dependent nodes exist!');
    }

    // Removing all dependencies that points to this.
    for (const dependency of dependencies) {
      const index = dependency.to.getDependencies().findIndex((d) => d.to.getContext() === this.getContext());
      dependency.to.removeDependency(index);
    }

    this._deleteMarker = true;
  }

  override setContext(): string {
    return `${this.NODE_NAME}=${this.resourceId}`;
  }

  override synth(): IResource {
    return {
      properties: JSON.parse(JSON.stringify(this.properties)),
      resourceId: this.resourceId,
      response: JSON.parse(JSON.stringify(this.response)),
    };
  }

  static override async unSynth(
    deserializationClass: any,
    resource: IResource,
    parentResourceIds: string[],
    deReferenceResource: (resourceId: string) => Promise<UnknownResource>,
  ): Promise<UnknownResource> {
    const parents = await Promise.all(parentResourceIds.map((p) => deReferenceResource(p)));
    const newResource = new deserializationClass(resource.resourceId, resource.properties, parents);
    for (const key of Object.keys(resource.response)) {
      newResource.response[key] = resource.response[key];
    }
    return newResource;
  }
}
