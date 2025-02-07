import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class EcsServiceSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    desiredCount: number;
    serviceName: string;
  }>();

  override response = Schema<{
    serviceArn: string;
  }>();
}
