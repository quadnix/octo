import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Service} model representing a CloudFront distribution.
 *
 * @group Anchors/AwsCloudFront
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsCloudFrontAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Service;

  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account the distribution is created in.
   * * `properties.distributionName` - The name of the distribution.
   */
  @Validate({
    destruct: (value: AwsCloudFrontAnchorSchema['properties']): string[] => [
      value.awsAccountId,
      value.distributionName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    distributionName: string;
  }>();
}
