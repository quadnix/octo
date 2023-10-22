import { Resource } from './resource.abstract';

export abstract class SharedResource<T> extends Resource<T> {
  override readonly MODEL_NAME;
  override readonly MODEL_TYPE = 'shared-resource';

  readonly resource: Resource<T>;

  protected constructor(resource: Resource<T>) {
    super(resource.resourceId, resource.properties, []);

    this.MODEL_NAME = resource.MODEL_NAME;
    this.resource = resource;

    for (const key in resource.response) {
      this.response[key] = resource.response[key];
    }

    // Separately initialize parents, without calling associateWith().
    this.dependencies.push(...resource['dependencies']);
  }

  merge(sharedResource: SharedResource<T>): SharedResource<T> {
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
    resource: Resource<unknown>,
  ): Promise<SharedResource<unknown>> {
    return new deserializationClass(resource);
  }
}