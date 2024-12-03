import { type AResource, BaseResourceSchema, Schema } from '@quadnix/octo';

export class RouteTableSchema extends BaseResourceSchema {
  override properties = Schema<{
    associateWithInternetGateway: boolean;
    awsRegionId: string;
  }>();

  override response = Schema<{
    RouteTableId: string;
    subnetAssociationId: string;
  }>();
}

class RouteTableInternetGatewaySchema extends BaseResourceSchema {
  override response = Schema<{
    InternetGatewayId: string;
  }>();
}
export type RouteTableInternetGateway = AResource<RouteTableInternetGatewaySchema, any>;

class RouteTableSubnetSchema extends BaseResourceSchema {
  override response = Schema<{
    SubnetId: string;
  }>();
}
export type RouteTableSubnet = AResource<RouteTableSubnetSchema, any>;

class RouteTableVpcSchema extends BaseResourceSchema {
  override response = Schema<{
    VpcId: string;
  }>();
}
export type RouteTableVpc = AResource<RouteTableVpcSchema, any>;
