import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @group Resources/EfsMountTarget
 */
export class EfsMountTargetSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value: EfsMountTargetSchema['properties']): string[] => [value.awsAccountId, value.awsRegionId],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
  }>();

  @Validate({
    destruct: (value: EfsMountTargetSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.MountTargetId) {
        subjects.push(value.MountTargetId);
      }
      if (value.NetworkInterfaceId) {
        subjects.push(value.NetworkInterfaceId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    MountTargetId?: string;
    NetworkInterfaceId?: string;
  }>();
}
