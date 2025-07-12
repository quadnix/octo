import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `EfsMountTargetSchema` class is the schema for the `EfsMountTarget` resource,
 * which represents the AWS Elastic File System (EFS) Mount Target resource.
 * This resource can create a efs mount target in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/efs/).
 *
 * @group Resources/EfsMountTarget
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   efs((Efs)) --> efs_mount_target((Efs<br>Mount<br>Target))
 *   subnet((Subnet)) --> efs_mount_target
 *   security_group((Security<br>Group)) --> efs_mount_target
 * ```
 * @overrideProperty resourceId - The resource id is of format `efs-mount-<region-id>-<subnet-name>-<file-system-name>`
 */
export class EfsMountTargetSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   */
  @Validate({
    destruct: (value: EfsMountTargetSchema['properties']): string[] => [value.awsAccountId, value.awsRegionId],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
  }>();

  /**
   * Saved response.
   * * `response.MountTargetId` - The mount target id.
   * * `response.NetworkInterfaceId` - The network interface id.
   */
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
