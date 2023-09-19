import { Diff, DiffAction, SharedResource } from '@quadnix/octo';
import { IEcrImageMetadata, IEcrImageReplicationMetadata } from './ecr-image.interface';
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
      const ecrImageReplicationMetadata: IEcrImageReplicationMetadata =
        (previous.response?.replicationsStringified as string)?.length > 0
          ? JSON.parse(previous.response.replicationsStringified as string)
          : {};

      // Deletion of source image is not possible while replication images exist.
      // Deletion of replication images must be handled with an update.
      // Deletion of source images must be handled with a delete.
      if (
        ecrImageSource.awsRegion &&
        ecrImageSource.awsRegion === (this.resource as EcrImage).getAwsRegionId() &&
        ecrImageReplicationMetadata.regions.length > 0
      ) {
        throw new Error('Attempting to delete the source image while replication exists!');
      } else if (
        ecrImageSource.awsRegion &&
        ecrImageSource.awsRegion !== (this.resource as EcrImage).getAwsRegionId()
      ) {
        const updateKey = 'replicationsStringified';
        const updateValue = this.isMarkedDeleted() ? 'DELETE' : 'ADD';
        this.markUpdated(updateKey, updateValue);
        diffs.push(new Diff(this, DiffAction.UPDATE, updateKey, updateValue));
        return diffs;
      }
    }

    if (this.isMarkedDeleted()) {
      diffs.push(new Diff(this, DiffAction.DELETE, 'resourceId', this.resourceId));
    } else {
      diffs.push(new Diff(this, DiffAction.ADD, 'resourceId', this.resourceId));
    }

    return diffs;
  }
}
