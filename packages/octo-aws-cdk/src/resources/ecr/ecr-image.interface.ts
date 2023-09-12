export interface IEcrImageProperties {
  buildCommand: string;
  dockerExec: string;
  dockerFileDirectory: string;
  imageName: string;
  imageTag: string;
}

export interface IEcrImageResponse {
  registryId: string;
  replicationRegions: string;
  repositoryArn: string;
  repositoryName: string;
}
