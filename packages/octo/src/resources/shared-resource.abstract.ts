import type { UnknownResource } from '../app.type.js';
import { ResourceError } from '../errors/index.js';
import type { Diff } from '../functions/diff/diff.js';
import { AResource } from './resource.abstract.js';
import type { BaseResourceSchema } from './resource.schema.js';

export abstract class ASharedResource<S extends BaseResourceSchema, T extends UnknownResource> extends AResource<S, T> {
  /**
   * @deprecated Cloning is not supported in shared resources!
   */
  static override async cloneResource<T>(): Promise<T> {
    throw new ResourceError('Cloning is not supported in shared resources!', this);
  }

  /**
   * @deprecated Cloning is not supported in shared resources!
   */
  override async cloneResourceInPlace(): Promise<void> {
    throw new ResourceError('Cloning is not supported in shared resources!', this);
  }

  override async diff(): Promise<Diff[]> {
    return [];
  }

  /**
   * @deprecated Diff inverse is not supported in shared resources!
   */
  override async diffInverse(): Promise<void> {
    throw new ResourceError('Diff inverse is not supported in shared resources!', this);
  }

  /**
   * @deprecated Diff properties is not supported in shared resources!
   */
  override async diffProperties(): Promise<Diff[]> {
    throw new ResourceError('Diff properties is not supported in shared resources!', this);
  }

  override getSharedResource(): ASharedResource<S, T> | undefined {
    return undefined;
  }

  merge(previousSharedResource: ASharedResource<S, T>): ASharedResource<S, T> {
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
