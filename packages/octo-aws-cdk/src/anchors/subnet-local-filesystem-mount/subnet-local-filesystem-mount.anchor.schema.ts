import { BaseAnchorSchema, Schema, type Subnet, Validate } from '@quadnix/octo';

/**
 * @group Anchors/SubnetLocalFilesystemMount
 */
export class SubnetLocalFilesystemMountAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Subnet;

  @Validate({
    destruct: (value: SubnetLocalFilesystemMountAnchorSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.filesystemName,
      value.subnetName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    filesystemName: string;
    subnetName: string;
  }>();
}
