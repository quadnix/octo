import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class SubnetSchema extends BaseResourceSchema {
  override properties = Schema<{
    AvailabilityZone: string;
    awsRegionId: string;
    CidrBlock: string;
  }>();

  override response = Schema<{
    SubnetId: string;
  }>();
}
