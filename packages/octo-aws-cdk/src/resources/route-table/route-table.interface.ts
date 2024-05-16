export interface IRouteTableProperties {
  associateWithInternetGateway: boolean;
  awsRegionId: string;
}

export interface IRouteTableResponse {
  RouteTableId: string;
  subnetAssociationId: string;
}
