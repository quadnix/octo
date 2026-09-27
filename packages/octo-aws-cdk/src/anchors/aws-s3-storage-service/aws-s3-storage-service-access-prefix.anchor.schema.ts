import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Service} model representing an AWS S3 bucket, and names one
 * key prefix in it that other modules may be granted read or write access to.
 *
 * @group Anchors/AwsS3StorageService
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsS3StorageServiceAccessPrefixAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Service;

  /**
   * Input properties.
   * * `properties.accessPrefix`: The key prefix within the S3 bucket, e.g. `uploads`.
   * * `properties.bucketName`: The name of the S3 bucket.
   */
  @Validate({
    destruct: (value: AwsS3StorageServiceAccessPrefixAnchorSchema['properties']): string[] => [
      value.accessPrefix,
      value.bucketName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    accessPrefix: string;
    bucketName: string;
  }>();
}
