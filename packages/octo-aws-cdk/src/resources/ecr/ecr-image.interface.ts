export interface IEcrImageProperties {
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
  awsRegion: string;
  registryId: string;
  repositoryArn?: string;
  repositoryName: string;
  repositoryUri?: string;
}
