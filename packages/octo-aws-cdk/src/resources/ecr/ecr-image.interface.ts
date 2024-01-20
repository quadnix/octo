export interface IEcrImageProperties {
  awsRegionId: string;
  dockerExec: string;
  dockerfileDirectory: string;
  imageName: string;
  imageTag: string;
}

export interface IEcrImageResponse {
  awsRegionId: string;
  registryId: string;
  repositoryArn?: string;
  repositoryName: string;
  repositoryUri?: string;
}
