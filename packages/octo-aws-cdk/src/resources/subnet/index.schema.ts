import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class SubnetSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value: SubnetSchema['properties']): string[] => [
      value.AvailabilityZone,
      value.awsAccountId,
      value.awsRegionId,
      value.CidrBlock,
      value.subnetName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    AvailabilityZone: string;
    awsAccountId: string;
    awsRegionId: string;
    CidrBlock: string;
    subnetName: string;
  }>();

  @Validate({
    destruct: (value: SubnetSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.SubnetId) {
        subjects.push(value.SubnetId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    SubnetId?: string;
  }>();
}
