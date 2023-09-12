import { Diff, DiffAction, SharedResource } from '@quadnix/octo';
import { EcrImage } from './ecr-image.resource';

export class SharedEcrImage extends SharedResource<EcrImage> {
  readonly MODEL_NAME: string = 'ecr-image';

  constructor(resource: EcrImage) {
    super(resource);
  }

  override async diff(previous?: SharedEcrImage): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if ((this.response?.replicationRegions as string)?.length > 0) {
      this.diffMarkers.update = { key: 'replicationRegions', value: this.diffMarkers.delete ? 'DELETE' : 'ADD' };
      diffs.push(new Diff(this, DiffAction.UPDATE, this.diffMarkers.update.key, this.diffMarkers.update.value));
    } else {
      if (!previous && this.diffMarkers.delete) {
        diffs.push(new Diff(this, DiffAction.DELETE, 'resourceId', this.resourceId));
      } else if (!previous) {
        diffs.push(new Diff(this, DiffAction.ADD, 'resourceId', this.resourceId));
      }
    }

    return diffs;
  }
}
