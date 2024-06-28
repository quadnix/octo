import { ModelType, type UnknownResource } from '../app.type.js';
import { type Dependency } from '../functions/dependency/dependency.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { AModel } from '../models/model.abstract.js';
import type { IResource } from './resource.interface.js';
import type { ASharedResource } from './shared-resource.abstract.js';

export abstract class AResource<T> extends AModel<IResource, T> {
  abstract override readonly MODEL_NAME: string;
  override readonly MODEL_TYPE: ModelType = ModelType.RESOURCE;

  readonly response: IResource['response'] = {};

  protected constructor(
    readonly resourceId: IResource['resourceId'],
    readonly properties: IResource['properties'],
    parents: UnknownResource[],
  ) {
    super();

    for (const parent of parents) {
      parent.addChild('resourceId', this, 'resourceId');
    }
  }

  override addAnchor(): void {
    throw new Error('Anchors are not supported in resources!');
  }

  override addRelationship(): { thatToThisDependency: Dependency; thisToThatDependency: Dependency } {
    throw new Error('Relationships are not supported in resources!');
  }

  // @ts-expect-error since this overridden diff() is always called with previous.
  override async diff(previous: T | ASharedResource<T>): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const propertyDiffs = await this.diffProperties(previous);
    diffs.push(...propertyDiffs);

    // Parent diffs.
    const previousParents = Object.values((previous as unknown as UnknownResource).getParents())
      .flat()
      .map((d) => d.to);
    const currentParents = Object.values(this.getParents())
      .flat()
      .map((d) => d.to);
    const deletedParents = previousParents.filter(
      (p) => currentParents.findIndex((c) => c.getContext() === p.getContext()) === -1,
    );
    for (const parent of deletedParents) {
      diffs.push(new Diff(this, DiffAction.DELETE, 'parent', parent));
    }
    const newParents = currentParents.filter(
      (c) => previousParents.findIndex((p) => p.getContext() === c.getContext()) === -1,
    );
    for (const parent of newParents) {
      diffs.push(new Diff(this, DiffAction.ADD, 'parent', parent));
    }

    return diffs;
  }

  override async diffProperties(previous: T | ASharedResource<T>): Promise<Diff[]> {
    return DiffUtility.diffObject(previous as unknown as UnknownResource, this, 'properties');
  }

  getSharedResource(): ASharedResource<T> | undefined {
    const sameModelDependencies = this.getChildren(this.MODEL_NAME)[this.MODEL_NAME];
    const sharedResourceDependency = sameModelDependencies?.find((d) => d.to.MODEL_TYPE === ModelType.SHARED_RESOURCE);
    return sharedResourceDependency?.to as ASharedResource<T>;
  }

  override setContext(): string {
    return `${this.MODEL_NAME}=${this.resourceId}`;
  }

  override synth(): IResource {
    return {
      properties: JSON.parse(JSON.stringify(this.properties)),
      resourceId: this.resourceId,
      response: JSON.parse(JSON.stringify(this.response)),
    };
  }

  static override async unSynth(
    deserializationClass: any,
    resource: IResource,
    parentResourceIds: string[],
    deReferenceResource: (resourceId: string) => Promise<UnknownResource>,
  ): Promise<UnknownResource> {
    const parents = await Promise.all(parentResourceIds.map((p) => deReferenceResource(p)));
    const newResource = new deserializationClass(resource.resourceId, resource.properties, parents);
    for (const key of Object.keys(resource.response)) {
      newResource.response[key] = resource.response[key];
    }
    return newResource;
  }
}
