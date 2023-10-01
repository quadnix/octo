export interface IEcsClusterProperties {
  clusterName: string;
}

export interface IEcsClusterResponse {
  sharedMetadataStringified: string;
}

export interface IEcsClusterSharedMetadata {
  regions: IEcsClusterMetadata[];
}

interface IEcsClusterMetadata {
  awsRegionId: string;
  clusterArn: string;
  regionId: string;
}
