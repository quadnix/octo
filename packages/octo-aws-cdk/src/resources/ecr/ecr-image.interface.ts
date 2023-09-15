export interface IEcrImageProperties {
  buildCommand: string;
  dockerExec: string;
  dockerFileDirectory: string;
  imageName: string;
  imageTag: string;
}

export interface IEcrImageResponse {
  sourceStringified: string;
  replicationsStringified: string;
}

export interface IEcrImageMetadata {
  awsRegion: string;
  registryId: string;
  repositoryArn: string;
  repositoryName: string;
  repositoryUri: string;
}

export interface IEcrImageReplicationMetadata {
  regions: { awsRegion: string; repositoryUri: string }[];
  serviceRoleForECRReplication: string;
}
