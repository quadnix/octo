import { NodeType } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';
import { AResource } from './resource.abstract.js';

export abstract class ASharedResource<T> extends AResource<T> {
  override readonly NODE_TYPE: NodeType = NodeType.SHARED_RESOURCE;

  override async diff(): Promise<Diff[]> {
    return [];
  }

  findParentsByProperty(filters: { key: keyof AResource<T>['properties']; value: any }[]): AResource<T>[] {
    const parents: AResource<T>[] = [];
    const dependencies = Object.values(this.getParents()).flat();
    for (const d of dependencies) {
      const resource = d.to as AResource<T>;
      if (filters.every((c) => resource.properties[c.key] === c.value)) {
        parents.push(resource);
      }
    }
    return parents;
  }

  override getSharedResource(): ASharedResource<T> | undefined {
    return undefined;
  }

  merge(previousSharedResource: ASharedResource<T>): ASharedResource<T> {
    const currentDependencies = Object.values(this.getParents()).flat();
    const previousDependencies = Object.values(previousSharedResource.getParents()).flat();

    for (const key in previousSharedResource.properties) {
      if (previousSharedResource.properties.hasOwnProperty(key) && !(key in this.properties)) {
        this.properties[key] = previousSharedResource.properties[key];
      }
    }

    for (const key in previousSharedResource.response) {
      if (previousSharedResource.response.hasOwnProperty(key) && !(key in this.response)) {
        this.response[key] = previousSharedResource.response[key];
      }
    }

    const previousParentsNotInCurrentSharedResource = previousDependencies
      .filter((pd) => !currentDependencies.find((cd) => cd.isEqual(pd)))
      .map((pd) => pd.to);
    for (const parent of previousParentsNotInCurrentSharedResource) {
      parent.addChild('resourceId', this, 'resourceId');
    }

    return this;
  }
}
