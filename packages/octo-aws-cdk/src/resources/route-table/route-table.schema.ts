import { BaseResourceSchema, Schema } from '@quadnix/octo';

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
