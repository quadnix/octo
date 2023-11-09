export interface IEcrImageProperties {
  awsRegionId: string;
  buildCommand: string;
  dockerExec: string;
  dockerFileDirectory: string;
  imageName: string;
  imageTag: string;
}

export interface IEcrImageResponse {
  replicationsStringified: string;
}

export interface IEcrImageReplicationMetadata {
  regions: IEcrImageMetadata[];
}

interface IEcrImageMetadata {
  awsRegionId: string;
  registryId: string;
  repositoryArn?: string;
  repositoryName: string;
  repositoryUri?: string;
}
