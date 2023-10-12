import { Diff, DiffAction } from '../functions/diff/diff.model';
import { Model } from '../models/model.abstract';
import { IModel } from '../models/model.interface';
import { IResource } from './resource.interface';
import { SharedResource } from './shared-resource.abstract';

type IResourceMarkers = { delete: boolean; replace: boolean; update: { key: string; value: any } | null };

export abstract class Resource<T> extends Model<IResource, T> {
  override readonly MODEL_TYPE: IModel<IResource, T>['MODEL_TYPE'] = 'resource';

  private readonly diffMarkers: IResourceMarkers = {
    delete: false,
    replace: false,
    update: null,
  };

  readonly properties: IResource['properties'] = {};

  readonly resourceId: IResource['resourceId'];

  readonly response: IResource['response'] = {};

  protected constructor(
    resourceId: IResource['resourceId'],
    properties: IResource['properties'],
    parents: Resource<unknown>[],
  ) {
    super();

    this.resourceId = resourceId;

    for (const key in properties) {
      this.properties[key] = properties[key];
    }

    this.associateWith(parents);
  }

  associateWith(resources: Resource<unknown>[]): void {
    for (const resource of resources) {
      const childrenDependencies = resource.getChildren(this.MODEL_NAME);
      if (!childrenDependencies[this.MODEL_NAME]) {
        childrenDependencies[this.MODEL_NAME] = [];
      }

      // Check for duplicates.
      const selfDependencies = childrenDependencies[this.MODEL_NAME].map((d) => d.to as Resource<unknown>);
      if (selfDependencies.find((r) => r.resourceId === this.resourceId)) {
        throw new Error('Resource already associated with!');
      }

      // Add child.
      resource.addChild('resourceId' as never, this, 'resourceId');
    }
  }

  override async diff(previous?: T | SharedResource<T>): Promise<Diff[]> {
    const diffs: Diff[] = [];

    // Diff markers gets precedence over property diff.
    if (this.diffMarkers.delete) {
      diffs.push(new Diff(previous as Model<IResource, T>, DiffAction.DELETE, 'resourceId', this.resourceId));
    } else if (this.diffMarkers.replace) {
      diffs.push(new Diff(this, DiffAction.REPLACE, 'resourceId', this.resourceId));
    } else if (this.diffMarkers.update !== null) {
      diffs.push(new Diff(this, DiffAction.UPDATE, this.diffMarkers.update.key, this.diffMarkers.update.value));
    }

    // We defer calculating property diff to real resource implementations,
    // since they have better context on how to handle their specific property CUD.

    return diffs;
  }

  getContext(): string {
    return `${this.MODEL_NAME}=${this.resourceId}`;
  }

  getUpdateMarker(): IResourceMarkers['update'] {
    return this.diffMarkers.update;
  }

  isMarkedDeleted(): boolean {
    return this.diffMarkers.delete;
  }

  isMarkedReplaced(): boolean {
    return this.diffMarkers.replace;
  }

  markDeleted(): void {
    this.remove();
    this.diffMarkers.delete = true;
  }

  markReplaced(): void {
    this.diffMarkers.replace = true;
  }

  markUpdated(key: string, value: any): void {
    this.diffMarkers.update = { key, value };
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
    deReferenceResource: (resourceId: string) => Promise<Resource<unknown>>,
  ): Promise<Resource<unknown>> {
    const parents = await Promise.all(parentResourceIds.map((p) => deReferenceResource(p)));
    const deReferencedResource = new deserializationClass(resource.resourceId, resource.properties, parents);
    for (const key in resource.response) {
      deReferencedResource.response[key] = resource.response[key];
    }
    return deReferencedResource;
  }
}
