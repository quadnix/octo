import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class SubnetSchema extends BaseResourceSchema {
  override properties = Schema<{
    AvailabilityZone: string;
    awsAccountId: string;
    awsRegionId: string;
    CidrBlock: string;
    subnetName: string;
  }>();

  override response = Schema<{
    SubnetId: string;
  }>();
}
