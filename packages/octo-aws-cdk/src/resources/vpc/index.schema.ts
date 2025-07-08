import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @group Resources/Vpc
 */
export class VpcSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value: VpcSchema['properties']): string[] => [
      value.awsAccountId,
      ...value.awsAvailabilityZones,
      value.awsRegionId,
      value.CidrBlock,
      value.InstanceTenancy,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsAvailabilityZones: string[];
    awsRegionId: string;
    CidrBlock: string;
    InstanceTenancy: 'default';
  }>();

  @Validate({
    destruct: (value: VpcSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.VpcArn) {
        subjects.push(value.VpcArn);
      }
      if (value.VpcId) {
        subjects.push(value.VpcId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    VpcArn?: string;
    VpcId?: string;
  }>();
}
