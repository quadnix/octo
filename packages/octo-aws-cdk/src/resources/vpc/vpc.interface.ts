export interface IVpcProperties {
  awsRegionId: string;
  CidrBlock: string;
  InstanceTenancy: 'default';
}

export interface IVpcResponse {
  VpcId: string;
}
