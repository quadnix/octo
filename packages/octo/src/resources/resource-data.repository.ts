import { ActionOutputs, ModelType, UnknownResource } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { IResource } from './resource.interface.js';

export class ResourceDataRepository {
  constructor(
    private newResources: UnknownResource[] = [],
    private oldResources: UnknownResource[] = [],
  ) {
    Object.freeze(this.oldResources);
  }

  private async _diffResources(newResources: ActionOutputs, oldResources: ActionOutputs): Promise<Diff[]> {
    const diffs: Diff[] = [];

    for (const oldResourceId in oldResources) {
      if (!newResources[oldResourceId]) {
        diffs.push(new Diff(oldResources[oldResourceId], DiffAction.DELETE, 'resourceId', oldResourceId));
      } else {
        const rDiff = await newResources[oldResourceId].diff(oldResources[oldResourceId]);
        diffs.push(...rDiff);
      }
    }

    for (const newResourceId in newResources) {
      if (!oldResources[newResourceId]) {
        const newResource = newResources[newResourceId];

        if (newResource.MODEL_TYPE === 'shared-resource' || newResource.getSharedResource() !== undefined) {
          const rDiff = await newResource.diff();
          diffs.push(...rDiff);
        } else {
          diffs.push(new Diff(newResource, DiffAction.ADD, 'resourceId', newResource.resourceId));
        }
      }
    }

    return diffs;
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
    const newResources: ActionOutputs = this.newResources.reduce(
      (accumulator, current) => ({ ...accumulator, [current.resourceId]: current }),
      {},
    );
    const oldResources: ActionOutputs = this.oldResources.reduce(
      (accumulator, current) => ({ ...accumulator, [current.resourceId]: current }),
      {},
    );

    return this._diffResources(newResources, oldResources);
  }

  getById(resourceId: IResource['resourceId']): UnknownResource | undefined {
    return this.newResources.find((r) => r.resourceId === resourceId);
  }

  getByProperties(filters: { key: string; value: any }[] = []): UnknownResource[] {
    return this.newResources.filter((r) => filters.every((c) => r.properties[c.key] === c.value));
  }
}

@Factory<ResourceDataRepository>(ResourceDataRepository)
export class ResourceDataRepositoryFactory {
  private static instance: ResourceDataRepository;

  static async create(
    forceNew: boolean,
    newResources: UnknownResource[],
    oldResources: UnknownResource[],
  ): Promise<ResourceDataRepository> {
    if (!this.instance) {
      this.instance = new ResourceDataRepository(newResources, oldResources);
    }
    if (forceNew) {
      const newInstance = new ResourceDataRepository(newResources, oldResources);
      Object.keys(this.instance).forEach((key) => (this.instance[key] = newInstance[key]));
    }
    return this.instance;
  }
}
