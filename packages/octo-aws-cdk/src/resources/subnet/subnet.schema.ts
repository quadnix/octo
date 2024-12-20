import { type AResource, BaseResourceSchema, Schema } from '@quadnix/octo';

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

export class SubnetVpcSchema extends BaseResourceSchema {
  override response = Schema<{
    VpcId: string;
  }>();
}
export type SubnetVpc = AResource<SubnetVpcSchema, any>;
