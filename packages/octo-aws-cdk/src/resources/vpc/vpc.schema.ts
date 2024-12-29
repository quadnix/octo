import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class VpcSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAvailabilityZones: string[];
    awsRegionId: string;
    CidrBlock: string;
    InstanceTenancy: 'default';
  }>();

  override response = Schema<{
    VpcId: string;
  }>();
}
