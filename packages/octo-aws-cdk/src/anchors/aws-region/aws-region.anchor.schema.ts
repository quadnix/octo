import { BaseAnchorSchema, type Region, Schema, Validate } from '@quadnix/octo';

/**
 * @group Anchors/AwsRegion
 */
export class AwsRegionAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Region;

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
