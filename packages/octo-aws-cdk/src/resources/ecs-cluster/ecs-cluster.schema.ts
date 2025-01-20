import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class EcsClusterSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    clusterName: string;
    regionId: string;
  }>();

  override response = Schema<{
    clusterArn: string;
  }>();
}
