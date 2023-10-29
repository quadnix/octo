export interface IS3WebsiteProperties {
  Bucket: string;
  ErrorDocument: string;
  IndexDocument: string;
}

export interface IS3WebsiteResponse {
  replicationsStringified: string;
}

export interface IS3WebsiteReplicationMetadata {
  awsRegionId: string;
  regionId: string;
}
