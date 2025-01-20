import { type AResource, BaseResourceSchema, Schema } from '@quadnix/octo';

export class RouteTableSchema extends BaseResourceSchema {
  override properties = Schema<{
    associateWithInternetGateway: boolean;
    awsAccountId: string;
    awsRegionId: string;
  }>();

  override response = Schema<{
    RouteTableId: string;
    subnetAssociationId: string;
  }>();
}

export class RouteTableInternetGatewaySchema extends BaseResourceSchema {
  override response = Schema<{
    InternetGatewayId: string;
  }>();
}
export type RouteTableInternetGateway = AResource<RouteTableInternetGatewaySchema, any>;

export class RouteTableSubnetSchema extends BaseResourceSchema {
  override response = Schema<{
    SubnetId: string;
  }>();
}
export type RouteTableSubnet = AResource<RouteTableSubnetSchema, any>;

export class RouteTableVpcSchema extends BaseResourceSchema {
  override response = Schema<{
    VpcId: string;
  }>();
}
export type RouteTableVpc = AResource<RouteTableVpcSchema, any>;
