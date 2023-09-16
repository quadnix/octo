import { Diff, DiffAction, SharedResource } from '@quadnix/octo';
import { IEcrImageMetadata } from './ecr-image.interface';
import { EcrImage } from './ecr-image.resource';

export class SharedEcrImage extends SharedResource<EcrImage> {
  constructor(resource: EcrImage) {
    super(resource);
  }

  override async diff(previous?: SharedEcrImage): Promise<Diff[]> {
    const diffs: Diff[] = [];
    const ecrImageSource: IEcrImageMetadata =
      (this.response?.sourceStringified as string)?.length > 0
        ? JSON.parse(this.response.sourceStringified as string)
        : {};

    if (ecrImageSource.awsRegion) {
      this.diffMarkers.update = { key: 'replicationsStringified', value: this.diffMarkers.delete ? 'DELETE' : 'ADD' };
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
