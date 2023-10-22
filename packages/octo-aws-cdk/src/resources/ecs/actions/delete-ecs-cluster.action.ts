import { DeleteClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { AwsRegion } from '../../../models/region/aws.region.model.js';
import { IEcsClusterProperties, IEcsClusterResponse, IEcsClusterSharedMetadata } from '../ecs-cluster.interface.js';
import { EcsCluster } from '../ecs-cluster.resource.js';

export class DeleteEcsClusterAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEcsClusterAction';

  constructor(private readonly ecsClient: ECSClient, private readonly region: AwsRegion) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'ecs-cluster';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecsCluster = diff.model as EcsCluster;
    const properties = ecsCluster.properties as unknown as IEcsClusterProperties;
    const response = ecsCluster.response as unknown as IEcsClusterResponse;

    const ecsClusterSharedMetadata: IEcsClusterSharedMetadata =
      (response?.sharedMetadataStringified as string)?.length > 0
        ? JSON.parse(response.sharedMetadataStringified as string)
        : {};
    const sharedRegions = ecsClusterSharedMetadata.regions || [];

    // Cluster should only be deleted when there are no other AWS regions referencing it.
    if (sharedRegions.filter((r) => r.awsRegionId === this.region.nativeAwsRegionId).length === 1) {
      await this.ecsClient.send(
        new DeleteClusterCommand({
          cluster: properties.clusterName,
        }),
      );
    }

    // Set response.
    response.sharedMetadataStringified = JSON.stringify({
      regions: sharedRegions.filter((r) => r.regionId !== this.region.regionId),
    } as IEcsClusterSharedMetadata);
  }
}
