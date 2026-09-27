import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Service} model representing an AWS S3 bucket.
 *
 * @group Anchors/AwsS3StorageService
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsS3StorageServiceAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Service;

  /**
   * Input properties.
   * * `properties.awsAccountId` - AWS account ID.
   * * `properties.awsRegionId` - AWS region ID.
   * * `properties.bucketName` - S3 bucket name.
   * * `properties.contentDigest` - A digest of every file the bucket uploads, read from the local
   * files. It changes whenever any of them does, which is what an invalidation keys on.
   */
  @Validate({
    destruct: (value: AwsS3StorageServiceAnchorSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.bucketName,
      value.contentDigest,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    bucketName: string;
    contentDigest: string;
  }>();
}
