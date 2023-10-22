import { CreateClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { AwsRegion } from '../../../models/region/aws.region.model.js';
import { IEcsClusterProperties, IEcsClusterResponse, IEcsClusterSharedMetadata } from '../ecs-cluster.interface.js';
import { EcsCluster } from '../ecs-cluster.resource.js';

export class AddEcsClusterAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEcsClusterAction';

  constructor(private readonly ecsClient: ECSClient, private readonly region: AwsRegion) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'ecs-cluster';
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

    // Create a new cluster.
    const data = await this.ecsClient.send(
      new CreateClusterCommand({
        clusterName: properties.clusterName,
      }),
    );

    // Set response.
    sharedRegions.push({
      awsRegionId: this.region.nativeAwsRegionId,
      clusterArn: data.cluster!.clusterArn as string,
      regionId: this.region.regionId,
    });
    response.sharedMetadataStringified = JSON.stringify({
      regions: sharedRegions,
    } as IEcsClusterSharedMetadata);
  }
}
