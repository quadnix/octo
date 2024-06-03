import { ModelType } from '../app.type.js';
import type { ActionOutputs, UnknownResource } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import type { IResource } from './resource.interface.js';

export class ResourceDataRepository {
  constructor(
    private oldResources: UnknownResource[] = [],
    private newResources: UnknownResource[] = [],
  ) {
    Object.freeze(this.oldResources);
  }

  add(resource: UnknownResource): void {
    if (resource.MODEL_TYPE !== ModelType.RESOURCE && resource.MODEL_TYPE !== ModelType.SHARED_RESOURCE) {
      throw new Error('Adding non-resource model!');
    }

    // Insert or replace resources.
    const rIndex = this.newResources.findIndex((r) => r.resourceId === resource.resourceId);
    if (rIndex === -1) {
      this.newResources.push(resource);
    } else {
      this.newResources[rIndex] = resource;
    }
  }

  async diff(): Promise<Diff[]> {
    const oldResources: ActionOutputs = this.oldResources.reduce(
      (accumulator, current) => ({ ...accumulator, [current.resourceId]: current }),
      {},
    );
    const newResources: ActionOutputs = this.newResources.reduce(
      (accumulator, current) => ({ ...accumulator, [current.resourceId]: current }),
      {},
    );

    const diffs: Diff[] = [];

    for (const oldResourceId in oldResources) {
      if (!newResources[oldResourceId]) {
        diffs.push(new Diff(oldResources[oldResourceId], DiffAction.DELETE, 'resourceId', oldResourceId));
      } else {
        const newResource = newResources[oldResourceId];

        if (newResource.isMarkedDeleted()) {
          diffs.push(new Diff(oldResources[oldResourceId], DiffAction.DELETE, 'resourceId', oldResourceId));
        } else {
          const rDiff = await newResource.diff(oldResources[oldResourceId]);
          diffs.push(...rDiff);
        }
      }
    }

    for (const newResourceId in newResources) {
      if (!oldResources[newResourceId]) {
        const newResource = newResources[newResourceId];

        // A shared resource is being added, but shared resources don't have diffs.
        if (newResource.MODEL_TYPE === 'shared-resource') {
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
          diffs.push(new Diff(newResource, DiffAction.ADD, 'resourceId', newResource.resourceId));
        }
      }
    }

    return diffs;
  }

  getById(resourceId: IResource['resourceId']): UnknownResource | undefined {
    return this.newResources.find((r) => r.resourceId === resourceId);
  }

  getByProperties(filters: { key: string; value: any }[] = []): UnknownResource[] {
    return this.newResources.filter((r) => filters.every((c) => r.properties[c.key] === c.value));
  }

  /**
   * A resource model is not removed using traditional delete calls.
   * Instead, the resource serialization checks for a delete marker, skips serializing that resource.
   */
  remove(): void {
    throw new Error('Cannot use remove() on resources! Use a delete marker instead');
  }
}

@Factory<ResourceDataRepository>(ResourceDataRepository)
export class ResourceDataRepositoryFactory {
  private static instance: ResourceDataRepository;

  static async create(
    forceNew: boolean,
    oldResources: UnknownResource[],
    newResources: UnknownResource[],
  ): Promise<ResourceDataRepository> {
    if (!this.instance) {
      this.instance = new ResourceDataRepository(oldResources, newResources);
    }
    if (forceNew) {
      const newInstance = new ResourceDataRepository(oldResources, newResources);
      Object.keys(this.instance).forEach((key) => (this.instance[key] = newInstance[key]));
    }
    return this.instance;
  }
}
