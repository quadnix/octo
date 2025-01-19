import type { UnknownResource } from '../../app.type.js';
import { DiffAction } from '../../functions/diff/diff.js';

export class NodeUtility {
  static sortResourcesByDependency(resources: UnknownResource[]): UnknownResource[] {
    const sortedResources: UnknownResource[] = [];

    for (const resource of resources) {
      let index = 0;

      const dependencies = resource.getDependencies();
      for (const dependency of dependencies) {
        if (dependency.hasMatchingBehavior('resourceId', DiffAction.ADD, 'resourceId', DiffAction.ADD)) {
          const parentResource = dependency.to as UnknownResource;
          const parentIndex = sortedResources.findIndex((r) => r.resourceId === parentResource.resourceId);
          if (parentIndex !== -1) {
            index = Math.max(index, parentIndex + 1);
          }
        }
      }

      sortedResources.splice(index, 0, resource);
    }

    return sortedResources;
  }
}
