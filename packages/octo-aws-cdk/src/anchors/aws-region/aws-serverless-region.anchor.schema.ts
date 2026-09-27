import { BaseAnchorSchema, type Region, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Region} model representing an AWS region that holds
 * serverless things only, and so creates no network of its own.
 *
 * @group Anchors/AwsServerlessRegion
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsServerlessRegionAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Region;

  /**
   * Input properties.
   * * `properties.awsRegionId` - The AWS ID of the region.
   * * `properties.regionId` - The logical ID of the region.
   * * `properties.serverless` - Always `true`. It sets this anchor apart from any other region anchor,
   * so a region with a network never matches this schema.
   */
  @Validate([
    {
      destruct: (value: AwsServerlessRegionAnchorSchema['properties']): string[] => [value.awsRegionId, value.regionId],
      options: { minLength: 1 },
    },
    {
      options: {
        custom: (value: AwsServerlessRegionAnchorSchema['properties']): boolean => value.serverless === true,
      },
    },
  ])
  override properties = Schema<{
    awsRegionId: string;
    regionId: string;
    serverless: boolean;
  }>();
}
