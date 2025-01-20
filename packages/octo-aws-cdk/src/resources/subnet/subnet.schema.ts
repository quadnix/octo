import { type AResource, BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class SubnetSchema extends BaseResourceSchema {
  override properties = Schema<{
    AvailabilityZone: string;
    awsAccountId: string;
    awsRegionId: string;
    CidrBlock: string;
  }>();

  override response = Schema<{
    SubnetId: string;
  }>();
}

export class SubnetVpcSchema extends BaseResourceSchema {
  @Validate({ destruct: (value: { VpcId: string }): string[] => [value.VpcId], options: { minLength: 1 } })
  override response = Schema<{
    VpcId: string;
  }>();
}
export type SubnetVpc = AResource<SubnetVpcSchema, any>;
