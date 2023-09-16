import { Resource } from './resource.abstract';

export abstract class SharedResource<T> extends Resource<T> {
  override readonly MODEL_NAME;
  override readonly MODEL_TYPE = 'shared-resource';

  readonly resource: Resource<T>;

  protected constructor(resource: Resource<T>) {
    super(resource.resourceId, resource.properties, []);

    this.MODEL_NAME = resource.MODEL_NAME;
    this.parents.push(...resource.parents);
    this.resource = resource;
  }

  static override async unSynth(
    deserializationClass: any,
    resource: Resource<unknown>,
  ): Promise<SharedResource<unknown>> {
    return new deserializationClass(resource);
  }
}
