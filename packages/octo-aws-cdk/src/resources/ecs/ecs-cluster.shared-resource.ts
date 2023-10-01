import { Diff, DiffAction, SharedResource } from '@quadnix/octo';
import { IEcsClusterSharedMetadata } from './ecs-cluster.interface';
import { EcsCluster } from './ecs-cluster.resource';

export class SharedEcsCluster extends SharedResource<EcsCluster> {
  constructor(resource: EcsCluster) {
    super(resource);
  }

  override async diff(previous?: SharedEcsCluster): Promise<Diff[]> {
    const diffs: Diff[] = [];

    // Update marker for ECS shared resource is always set to regions.
    const updateMarker = this.getUpdateMarker();
    const [action, regionId] = updateMarker!.value.split(':');

    if (previous) {
      const ecsClusterSharedMetadata: IEcsClusterSharedMetadata =
        (previous.response?.sharedMetadataStringified as string)?.length > 0
          ? JSON.parse(previous.response.sharedMetadataStringified as string)
          : {};
      const sharedRegions = ecsClusterSharedMetadata.regions || [];
      const sharedRegion = sharedRegions.find((r) => r.regionId === regionId);

      // Copy shared-resource response data from previous.
      this.response.sharedMetadataStringified = JSON.stringify({
        regions: sharedRegions,
      } as IEcsClusterSharedMetadata);

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
