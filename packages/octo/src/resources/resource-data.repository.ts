import { type ActionOutputs, NodeType, type UnknownResource } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { DiffsOnDirtyResourcesTransactionError, ResourceError } from '../errors/index.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import type { AResource } from './resource.abstract.js';

export class ResourceDataRepository {
  private dirtyResources: UnknownResource[] = [];

  constructor(
    private actualResources: UnknownResource[],
    private oldResources: UnknownResource[],
    private newResources: UnknownResource[],
  ) {
    for (const resource of oldResources) {
      const actual = actualResources.find((r) => r.getContext() === resource.getContext());
      if (!resource.isDeepEquals(actual)) {
        this.dirtyResources.push(resource);
      }
    }
    for (const resource of actualResources) {
      if (!oldResources.find((r) => r.getContext() === resource.getContext())) {
        this.dirtyResources.push(resource);
      }
    }
  }

  addActualResource(resource: UnknownResource): void {
    if (
      (resource.constructor as typeof AResource).NODE_TYPE !== NodeType.RESOURCE &&
      (resource.constructor as typeof AResource).NODE_TYPE !== NodeType.SHARED_RESOURCE
    ) {
      throw new ResourceError('Adding non-resource node!', resource);
    }

    // Insert or replace resources.
    const rIndex = this.actualResources.findIndex((r) => r.getContext() === resource.getContext());
    if (rIndex === -1) {
      this.actualResources.push(resource);
    } else {
      this.actualResources[rIndex] = resource;
    }
  }

  addNewResource(resource: UnknownResource): void {
    if (
      (resource.constructor as typeof AResource).NODE_TYPE !== NodeType.RESOURCE &&
      (resource.constructor as typeof AResource).NODE_TYPE !== NodeType.SHARED_RESOURCE
    ) {
      throw new ResourceError('Adding non-resource node!', resource);
    }

    // Insert or replace resources.
    const rIndex = this.newResources.findIndex((r) => r.getContext() === resource.getContext());
    if (rIndex === -1) {
      this.newResources.push(resource);
    } else {
      this.newResources[rIndex] = resource;
    }

    // Clone response from old.
    const oIndex = this.oldResources.findIndex((r) => r.getContext() === resource.getContext());
    if (oIndex > -1) {
      resource.cloneResponseInPlace(this.oldResources[oIndex]);
    }
  }

  async diff(): Promise<Diff[]> {
    const oldResources: ActionOutputs = this.oldResources.reduce(
      (accumulator, current) => ({ ...accumulator, [current.getContext()]: current }),
      {},
    );
    const newResources: ActionOutputs = this.newResources.reduce(
      (accumulator, current) => ({ ...accumulator, [current.getContext()]: current }),
      {},
    );

    const diffs: Diff[] = [];

    for (const oldResource of Object.values(oldResources)) {
      if (oldResource.isMarkedDeleted()) {
        delete oldResources[oldResource.getContext()];
      }
    }
    for (const newResource of Object.values(newResources)) {
      if (newResource.isMarkedDeleted()) {
        delete newResources[newResource.getContext()];
      }
    }

    for (const oldResourceContext of Object.keys(oldResources)) {
      if (!newResources[oldResourceContext] || newResources[oldResourceContext].isMarkedDeleted()) {
        diffs.push(new Diff(oldResources[oldResourceContext], DiffAction.DELETE, 'resourceId', oldResourceContext));
      } else {
        const rDiff = await newResources[oldResourceContext].diff(oldResources[oldResourceContext]);
        diffs.push(...rDiff);
      }
    }

    for (const newResourceContext of Object.keys(newResources)) {
      if (oldResources[newResourceContext]) {
        continue;
      }

      const newResource = newResources[newResourceContext];

      // A shared resource is being added, but shared resources don't have diffs.
      if ((newResource.constructor as typeof AResource).NODE_TYPE === 'shared-resource') {
        continue;
      }

      const sharedResource = newResource.getSharedResource();
      if (sharedResource !== undefined) {
        // If a new resource is being added, and it has a shared resource,
        // we expect the resource to override diff() and diff against the shared resource.
        // The custom diff() would decide diff actions.
        const rDiff = await newResource.diff(sharedResource);
        diffs.push(...rDiff);
      } else {
        // The resource is a normal resource, and just needs to be added.
        diffs.push(new Diff(newResource, DiffAction.ADD, 'resourceId', newResourceContext));
      }
    }

    return diffs;
  }

  async diffDirty(): Promise<Diff[]> {
    const actualResources: ActionOutputs = this.actualResources.reduce(
      (accumulator, current) => ({ ...accumulator, [current.getContext()]: current }),
      {},
    );
    const newResources: ActionOutputs = this.newResources.reduce(
      (accumulator, current) => ({ ...accumulator, [current.getContext()]: current }),
      {},
    );

    const diffs: Diff[] = [];

    for (const actualResource of Object.values(actualResources)) {
      if (actualResource.isMarkedDeleted()) {
        delete actualResources[actualResource.getContext()];
      }
    }
    for (const newResource of Object.values(newResources)) {
      if (newResource.isMarkedDeleted()) {
        delete newResources[newResource.getContext()];
      }
    }

    for (const actualResourceContext of Object.keys(actualResources)) {
      if (!newResources[actualResourceContext] || newResources[actualResourceContext].isMarkedDeleted()) {
        diffs.push(
          new Diff(actualResources[actualResourceContext], DiffAction.DELETE, 'resourceId', actualResourceContext),
        );
      } else {
        const rDiff = await newResources[actualResourceContext].diff(actualResources[actualResourceContext]);
        diffs.push(...rDiff);
      }
    }

    for (const newResourceContext of Object.keys(newResources)) {
      if (actualResources[newResourceContext]) {
        continue;
      }

      const newResource = newResources[newResourceContext];

      // A shared resource is being added, but shared resources don't have diffs.
      if ((newResource.constructor as typeof AResource).NODE_TYPE === 'shared-resource') {
        continue;
      }

      const sharedResource = newResource.getSharedResource();
      if (sharedResource !== undefined) {
        // If a new resource is being added, and it has a shared resource,
        // we expect the resource to override diff() and diff against the shared resource.
        // The custom diff() would decide diff actions.
        const rDiff = await newResource.diff(sharedResource);
        diffs.push(...rDiff);
      } else {
        // The resource is a normal resource, and just needs to be added.
        diffs.push(new Diff(newResource, DiffAction.ADD, 'resourceId', newResourceContext));
      }
    }

    return diffs;
  }

  ensureDiffsNotOperatingOnDirtyResources(diffs: Diff[]): void {
    if (diffs.some((d) => this.dirtyResources.some((dr) => d.node.hasAncestor(dr)))) {
      throw new DiffsOnDirtyResourcesTransactionError(
        'Cannot operate diff on dirty resources!',
        diffs,
        this.dirtyResources,
      );
    }
  }

  getActualResourceByContext(context: string): UnknownResource | undefined {
    return this.actualResources.find((r) => r.getContext() === context);
  }

  getNewResourceByContext(context: string): UnknownResource | undefined {
    return this.newResources.find((r) => r.getContext() === context);
  }

  getActualResourcesByProperties(filters: { key: string; value: any }[] = []): UnknownResource[] {
    return this.actualResources.filter((r) => filters.every((c) => r.properties[c.key] === c.value));
  }

  getNewResourcesByProperties(filters: { key: string; value: any }[] = []): UnknownResource[] {
    return this.newResources.filter((r) => filters.every((c) => r.properties[c.key] === c.value));
  }

  removeNewResource(resource: UnknownResource): void {
    if (
      (resource.constructor as typeof AResource).NODE_TYPE !== NodeType.RESOURCE &&
      (resource.constructor as typeof AResource).NODE_TYPE !== NodeType.SHARED_RESOURCE
    ) {
      throw new ResourceError('Removing non-resource node!', resource);
    }

    if (!resource.isMarkedDeleted()) {
      resource.remove();
    }

    const rIndex = this.newResources.findIndex((r) => r.getContext() === resource.getContext());
    if (rIndex > -1) {
      this.newResources.splice(rIndex, 1);
    }
  }
}

@Factory<ResourceDataRepository>(ResourceDataRepository)
export class ResourceDataRepositoryFactory {
  private static instance: ResourceDataRepository;

  static async create(
    forceNew: boolean = false,
    actualResources: UnknownResource[] = [],
    oldResources: UnknownResource[] = [],
    newResources: UnknownResource[] = [],
  ): Promise<ResourceDataRepository> {
    if (!this.instance) {
      this.instance = new ResourceDataRepository(actualResources, oldResources, newResources);
    }

    if (forceNew) {
      const newResourceDataRepository = new ResourceDataRepository(actualResources, oldResources, newResources);

      this.instance['actualResources'] = actualResources;
      this.instance['dirtyResources'] = newResourceDataRepository['dirtyResources'];
      this.instance['newResources'] = newResources;
      this.instance['oldResources'] = oldResources;
    }

    return this.instance;
  }
}
