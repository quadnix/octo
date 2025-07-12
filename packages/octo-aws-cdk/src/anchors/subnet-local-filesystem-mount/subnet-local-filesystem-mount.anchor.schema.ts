import { BaseAnchorSchema, Schema, type Subnet, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Subnet} model representing a filesystem mount in an AWS subnet.
 *
 * @group Anchors/SubnetLocalFilesystemMount
 *
 * @hideconstructor
 */
export class SubnetLocalFilesystemMountAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Subnet;

  /**
   * Input properties.
   * * `properties.awsAccountId`: AWS account ID.
   * * `properties.awsRegionId`: AWS region ID.
   * * `properties.filesystemName`: Name of the filesystem.
   * * `properties.subnetName`: Name of the subnet.
   */
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
