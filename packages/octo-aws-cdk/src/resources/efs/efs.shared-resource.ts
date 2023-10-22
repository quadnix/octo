import { Diff, DiffAction, SharedResource } from '@quadnix/octo';
import { IEfsSharedMetadata } from './efs.interface.js';
import { Efs } from './efs.resource.js';

export class SharedEfs extends SharedResource<Efs> {
  constructor(resource: Efs) {
    super(resource);
  }

  override async diff(previous?: SharedEfs): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (!this.getUpdateMarker()) {
      return diffs;
    }

    // Update marker for EFS shared resource is always set to regions.
    const updateMarker = this.getUpdateMarker();
    const [action, regionId] = updateMarker!.value.split(':');

    // Only the EFS doesn't need to be created per OctoAWS region, but the mount point does.
    if (previous) {
      const efsSharedMetadata: IEfsSharedMetadata =
        (previous.response?.sharedMetadataStringified as string)?.length > 0
          ? JSON.parse(previous.response.sharedMetadataStringified as string)
          : {};
      const sharedRegions = efsSharedMetadata.regions || [];
      const sharedRegion = sharedRegions.find((r) => r.regionId === regionId);

      // Copy shared-resource response data from previous.
      this.response.sharedMetadataStringified = JSON.stringify({
        regions: sharedRegions,
      } as IEfsSharedMetadata);

      if (action.toUpperCase() === 'DELETE' && sharedRegion) {
        diffs.push(new Diff(this, DiffAction.DELETE, 'resourceId', this.resourceId));
      } else if (action.toUpperCase() === 'ADD' && !sharedRegion) {
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
