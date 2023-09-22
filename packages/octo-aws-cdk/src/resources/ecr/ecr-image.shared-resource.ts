import { Diff, DiffAction, SharedResource } from '@quadnix/octo';
import { IEcrImageReplicationMetadata } from './ecr-image.interface';
import { EcrImage } from './ecr-image.resource';

export class SharedEcrImage extends SharedResource<EcrImage> {
  constructor(resource: EcrImage) {
    super(resource);
  }

  override async diff(previous?: SharedEcrImage): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (previous) {
      const ecrImageReplicationMetadata: IEcrImageReplicationMetadata =
        (previous.response?.replicationsStringified as string)?.length > 0
          ? JSON.parse(previous.response.replicationsStringified as string)
          : {};
      const awsRegionId = (this.resource as EcrImage).getAwsRegionId();
      const replicationRegions = ecrImageReplicationMetadata.regions || [];

      // If region already has the image, skip resource diff. Else, continue with normal diff.
      if (replicationRegions.find((r) => r.awsRegion === awsRegionId)) {
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
