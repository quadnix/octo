import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class VpcSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAccountId: string;
    awsAvailabilityZones: string[];
    awsRegionId: string;
    CidrBlock: string;
    InstanceTenancy: 'default';
  }>();

  @Validate({ destruct: (value): string[] => [value.VpcId], options: { minLength: 1 } })
  override response = Schema<{
    VpcId: string;
  }>();
}
