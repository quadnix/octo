export interface IEfsProperties {
  awsRegionId: string;
  regionId: string;
}

export interface IEfsResponse {
  sharedMetadataStringified: string;
}

export interface IEfsSharedMetadata {
  regions: IEfsMetadata[];
}

interface IEfsMetadata {
  awsRegionId: string;
  FileSystemId: string;
  FileSystemArn: string;
  IpAddress: string;
  MountTargetId: string;
  NetworkInterfaceId: string;
  regionId: string;
}
