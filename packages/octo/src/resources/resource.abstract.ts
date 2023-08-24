import { Diff, DiffAction } from '../functions/diff/diff.model';
import { Model } from '../models/model.abstract';
import { IResource } from './resource.interface';

type IResourceMarkers = { delete: boolean; replace: boolean; update: { key: string; value: any } | null };

export abstract class Resource<T> extends Model<IResource, T> {
  override readonly MODEL_TYPE = 'resource';

  readonly diffMarkers: IResourceMarkers = {
    delete: false,
    replace: false,
    update: null,
  };

  readonly properties: IResource['properties'] = {};

  readonly resourceId: IResource['resourceId'];

  readonly response: IResource['response'] = {};

  protected constructor(resourceId: string) {
    super();

    this.resourceId = resourceId;
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
      resource.addChild('resourceId' as never, this, 'resourceId');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override async diff(previous?: T): Promise<Diff[]> {
    const diffs: Diff[] = [];

    // Diff markers gets precedence over property diff.
    if (this.diffMarkers.delete) {
      diffs.push(new Diff(this, DiffAction.DELETE, 'resourceId', this.resourceId));
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

  synth(): IResource {
    return {
      properties: this.properties,
      resourceId: this.resourceId,
      response: this.response,
    };
  }
}
