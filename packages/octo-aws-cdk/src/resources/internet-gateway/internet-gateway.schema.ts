import { type AResource, BaseResourceSchema, Schema } from '@quadnix/octo';

export class InternetGatewaySchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
  }>();

  override response = Schema<{
    InternetGatewayId: string;
  }>();
}

export class InternetGatewayVpcSchema extends BaseResourceSchema {
  override response = Schema<{
    VpcId: string;
  }>();
}
export type InternetGatewayVpc = AResource<InternetGatewayVpcSchema, any>;
