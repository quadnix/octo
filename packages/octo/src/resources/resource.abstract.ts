import { Model } from '../models/model.abstract';
import { IResource } from './resource.interface';

type IResourceMarkers = { delete: boolean; replace: boolean; update: string | null };

export abstract class Resource<T> extends Model<IResource, T> {
  readonly markers: IResourceMarkers = {
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

  getContext(): string {
    const parts = [`${this.MODEL_NAME}=${this.resourceId}`];

    const parents = this.getParents();
    const parentKeys = Object.keys(parents);
    for (const parentKey of parentKeys) {
      for (const dependency of parents[parentKey]) {
        parts.push(dependency.to.getContext());
      }
    }

    return parts.join(',');
  }

  synth(): IResource {
    return {
      properties: this.properties,
      resourceId: this.resourceId,
      response: this.response,
    };
  }
}
