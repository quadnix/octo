import { BaseResourceSchema, Schema } from '@quadnix/octo';

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
