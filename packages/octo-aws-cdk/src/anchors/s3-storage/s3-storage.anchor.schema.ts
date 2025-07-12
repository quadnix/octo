import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Service} model representing an AWS S3 bucket.
 *
 * @group Anchors/S3Storage
 *
 * @hideconstructor
 */
export class S3StorageAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Service;

  /**
   * Input properties.
   * * `properties.awsAccountId` - AWS account ID.
   * * `properties.awsRegionId` - AWS region ID.
   * * `properties.bucketName` - S3 bucket name.
   */
  @Validate({
    destruct: (value: S3StorageAnchorSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.bucketName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    bucketName: string;
  }>();
}
