// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IEfsProperties {}

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
