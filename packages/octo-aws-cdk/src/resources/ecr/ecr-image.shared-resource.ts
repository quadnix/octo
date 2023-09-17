import { Diff, DiffAction, SharedResource } from '@quadnix/octo';
import { IEcrImageMetadata } from './ecr-image.interface';
import { EcrImage } from './ecr-image.resource';

export class SharedEcrImage extends SharedResource<EcrImage> {
  constructor(resource: EcrImage) {
    super(resource);
  }

  /**
   * An ECR image can only be added, or removed.
   * Presence of `previous` indicates if an ECR repository has already been created.
   * If so, we must rely on ECR replication.
   * If not, we can assume this is the only resource of its kind.
   */
  override async diff(previous?: SharedEcrImage): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (previous) {
      const ecrImageSource: IEcrImageMetadata =
        (previous.response?.sourceStringified as string)?.length > 0
          ? JSON.parse(previous.response.sourceStringified as string)
          : {};

      if (ecrImageSource.awsRegion) {
        this.diffMarkers.update = { key: 'replicationsStringified', value: this.diffMarkers.delete ? 'DELETE' : 'ADD' };
        diffs.push(new Diff(this, DiffAction.UPDATE, this.diffMarkers.update.key, this.diffMarkers.update.value));
        return diffs;
      }
    }

    if (this.diffMarkers.delete) {
      diffs.push(new Diff(this, DiffAction.DELETE, 'resourceId', this.resourceId));
    } else {
      diffs.push(new Diff(this, DiffAction.ADD, 'resourceId', this.resourceId));
    }

    return diffs;
  }
}
