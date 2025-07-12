import { BaseAnchorSchema, type Region, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Region} model representing an AWS region.
 *
 * @group Anchors/AwsRegion
 *
 * @hideconstructor
 */
export class AwsRegionAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Region;

  /**
   * Input properties.
   * * `properties.awsRegionAZs` - List of availability zones in the region.
   * * `properties.awsRegionId` - The AWS ID of the region.
   * * `properties.regionId` - The logical ID of the region.
   */
  @Validate({
    destruct: (value: AwsRegionAnchorSchema['properties']): string[] => [
      ...value.awsRegionAZs,
      value.awsRegionId,
      value.regionId,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsRegionAZs: string[];
    awsRegionId: string;
    regionId: string;
  }>();
}
