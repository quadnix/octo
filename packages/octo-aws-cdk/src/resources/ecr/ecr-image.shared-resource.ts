import { ASharedResource, Diff, DiffAction, Resource } from '@quadnix/octo';
import { IEcrImageReplicationMetadata } from './ecr-image.interface.js';
import { EcrImage } from './ecr-image.resource.js';

@Resource()
export class SharedEcrImage extends ASharedResource<EcrImage> {
  constructor(resource: EcrImage) {
    super(resource);
  }

  override async diff(previous?: SharedEcrImage): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (!this.getUpdateMarker()) {
      return diffs;
    }

    // Update marker for ECR shared resource is always set to awsRegionId.
    const updateMarker = this.getUpdateMarker();
    const [action, awsRegionId] = updateMarker!.value.split(':');

    if (previous) {
      const ecrImageReplicationMetadata: IEcrImageReplicationMetadata =
        (previous.response?.replicationsStringified as string)?.length > 0
          ? JSON.parse(previous.response.replicationsStringified as string)
          : {};
      const replicationRegions = ecrImageReplicationMetadata.regions || [];
      const replicationRegion = replicationRegions.find((r) => r.awsRegionId === awsRegionId);

      // Copy shared-resource response data from previous.
      this.response.replicationsStringified = JSON.stringify({
        regions: replicationRegions,
      } as IEcrImageReplicationMetadata);

      if (action.toUpperCase() === 'DELETE' && replicationRegion) {
        diffs.push(new Diff(this, DiffAction.DELETE, 'resourceId', this.resourceId));
      } else if (action.toUpperCase() === 'ADD' && !replicationRegion) {
        diffs.push(new Diff(this, DiffAction.ADD, 'resourceId', this.resourceId));
      }

      return diffs;
    }

    if (action.toUpperCase() === 'DELETE') {
      diffs.push(new Diff(this, DiffAction.DELETE, 'resourceId', this.resourceId));
    } else if (action.toUpperCase() === 'ADD') {
      diffs.push(new Diff(this, DiffAction.ADD, 'resourceId', this.resourceId));
    }

    return diffs;
  }
}
