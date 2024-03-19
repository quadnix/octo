export interface IEcsServiceProperties {
  awsRegionId: string;
  desiredCount: number;
  serviceName: string;
}

export interface IEcsServiceResponse {
  serviceArn: string;
}
