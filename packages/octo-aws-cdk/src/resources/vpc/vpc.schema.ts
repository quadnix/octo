import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class VpcSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAccountId: string;
    awsAvailabilityZones: string[];
    awsRegionId: string;
    CidrBlock: string;
    InstanceTenancy: 'default';
  }>();

  override response = Schema<{
    VpcId: string;
  }>();
}
