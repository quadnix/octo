import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class InternetGatewaySchema extends BaseResourceSchema {
  override properties = Schema<{
    awsRegionId: string;
  }>();

  override response = Schema<{
    InternetGatewayId: string;
  }>();
}
