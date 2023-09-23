import { Diff, DiffAction, SharedResource } from '@quadnix/octo';
import { IEcrImageReplicationMetadata } from './ecr-image.interface';
import { EcrImage } from './ecr-image.resource';

export class SharedEcrImage extends SharedResource<EcrImage> {
  constructor(resource: EcrImage) {
    super(resource);
  }

  override async diff(previous?: SharedEcrImage): Promise<Diff[]> {
    const diffs: Diff[] = [];

    // Update marker for ECR shared resource is always set to regions.
    const updateMarker = this.getUpdateMarker();
    const [action, regionId] = updateMarker!.value.split(':');

    if (previous) {
      const ecrImageReplicationMetadata: IEcrImageReplicationMetadata =
        (previous.response?.replicationsStringified as string)?.length > 0
          ? JSON.parse(previous.response.replicationsStringified as string)
          : {};
      const replicationRegions = ecrImageReplicationMetadata.regions || [];
      const replicationRegion = replicationRegions.find((r) => r.regionId === regionId);

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
