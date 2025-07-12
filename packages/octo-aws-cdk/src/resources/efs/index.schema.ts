import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `EfsSchema` class is the schema for the `Efs` resource,
 * which represents the AWS Elastic File System (EFS) resource.
 * This resource can create an efs in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/efs/).
 *
 * @group Resources/Efs
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has no parents.
 * @overrideProperty resourceId - The resource id is of format `efs-<region-id>-<file-system-name>`
 */
export class EfsSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.filesystemName` - The filesystem name.
   */
  @Validate({
    destruct: (value: EfsSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.filesystemName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    filesystemName: string;
  }>();

  /**
   * Saved response.
   * * `response.FileSystemArn` - The filesystem arn.
   * * `response.FileSystemId` - The filesystem id.
   */
  @Validate({
    destruct: (value: EfsSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.FileSystemArn) {
        subjects.push(value.FileSystemArn);
      }
      if (value.FileSystemId) {
        subjects.push(value.FileSystemId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    FileSystemArn?: string;
    FileSystemId?: string;
  }>();
}
