import { ModelType } from '../app.type.js';
import type { UnknownResource } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { AModel } from '../models/model.abstract.js';
import type { IResource } from './resource.interface.js';
import type { ASharedResource } from './shared-resource.abstract.js';

export abstract class AResource<T> extends AModel<IResource, T> {
  abstract override readonly MODEL_NAME: string;
  override readonly MODEL_TYPE: ModelType = ModelType.RESOURCE;

  /*
   * While model graph are well connected, resource graph can contain nodes that are completely disassociated.
   * For this reason, we traverse the resource graph using an array. Thus, even after calling remove()
   * on a resource node, it will be traversed, and there needs to be a marker to identify that it has been deleted.
   * */
  private _deleteMarker = false;

  readonly properties: IResource['properties'] = {};

  readonly resourceId: IResource['resourceId'];

  readonly response: IResource['response'] = {};

  protected constructor(
    resourceId: IResource['resourceId'],
    properties: IResource['properties'],
    parents: UnknownResource[],
  ) {
    super();

    this.resourceId = resourceId;

    for (const key in properties) {
      this.properties[key] = properties[key];
    }

    for (const parent of parents) {
      parent.addChild('resourceId', this, 'resourceId');
    }
  }

  // @ts-expect-error since this overridden diff() is always called with previous.
  async diff(previous: T | ASharedResource<T>): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const propertyDiffs = DiffUtility.diffObject(previous as unknown as UnknownResource, this, 'properties');
    diffs.push(...propertyDiffs);

    return diffs;
  }

  getContext(): string {
    return `${this.MODEL_NAME}=${this.resourceId}`;
  }

  getSharedResource(): ASharedResource<T> | undefined {
    const sameModelDependencies = this.getChildren(this.MODEL_NAME)[this.MODEL_NAME];
    const sharedResourceDependency = sameModelDependencies?.find((d) => d.to.MODEL_TYPE === ModelType.SHARED_RESOURCE);
    return sharedResourceDependency?.to as ASharedResource<T>;
  }

  isMarkedDeleted(): boolean {
    return this._deleteMarker;
  }

  markDeleted(): void {
    super.remove();
    this._deleteMarker = true;
  }

  override remove(): void {
    throw new Error('Cannot use remove() on resources! Use a delete marker instead');
  }

  synth(): IResource {
    return {
      properties: { ...this.properties },
      resourceId: this.resourceId,
      response: { ...this.response },
    };
  }

  static override async unSynth(
    deserializationClass: any,
    resource: IResource,
    parentResourceIds: string[],
    deReferenceResource: (resourceId: string) => Promise<UnknownResource>,
  ): Promise<UnknownResource> {
    const parents = await Promise.all(parentResourceIds.map((p) => deReferenceResource(p)));
    const deReferencedResource = new deserializationClass(resource.resourceId, resource.properties, parents);
    for (const key in resource.response) {
      deReferencedResource.response[key] = resource.response[key];
    }
    return deReferencedResource;
  }
}
