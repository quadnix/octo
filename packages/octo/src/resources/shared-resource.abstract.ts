import { ModelType } from '../models/model.interface.js';
import { AResource } from './resource.abstract.js';

export abstract class ASharedResource<T> extends AResource<T> {
  override readonly MODEL_NAME;
  override readonly MODEL_TYPE: ModelType = ModelType.SHARED_RESOURCE;

  readonly resource: AResource<T>;

  protected constructor(resource: AResource<T>) {
    super(resource.resourceId, resource.properties, []);

    this.MODEL_NAME = resource.MODEL_NAME;
    this.resource = resource;

    for (const key in resource.response) {
      this.response[key] = resource.response[key];
    }

    // Separately initialize parents, without calling associateWith(),
    // since that would generate duplicate dependencies.
    this.dependencies.push(...resource['dependencies']);
  }

  merge(sharedResource: ASharedResource<T>): ASharedResource<T> {
    for (const key in this.properties) {
      sharedResource.properties[key] = this.properties[key];
    }

    for (const key in this.response) {
      sharedResource.response[key] = this.response[key];
    }

    // Separately initialize parents, without calling associateWith().
    sharedResource['dependencies'].push(...this.dependencies);

    return sharedResource;
  }

  static override async unSynth(
    deserializationClass: any,
    resource: AResource<unknown>,
  ): Promise<ASharedResource<unknown>> {
    return new deserializationClass(resource);
  }
}
