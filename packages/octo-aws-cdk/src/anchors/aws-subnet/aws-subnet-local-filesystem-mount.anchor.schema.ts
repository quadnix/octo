import { type AOverlay, BaseAnchorSchema, type BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with an {@link AOverlay} overlay representing a filesystem mount in an AWS subnet.
 *
 * @group Anchors/AwsSubnet
 *
 * @hideconstructor
 */
export class AwsSubnetLocalFilesystemMountAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: AOverlay<BaseOverlaySchema, any>;

  /**
   * Input properties.
   * * `properties.awsAccountId`: AWS account ID.
   * * `properties.awsRegionId`: AWS region ID.
   * * `properties.filesystemName`: Name of the filesystem.
   * * `properties.subnetName`: Name of the subnet.
   */
  @Validate({
    destruct: (value: AwsSubnetLocalFilesystemMountAnchorSchema['properties']): string[] => [
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
