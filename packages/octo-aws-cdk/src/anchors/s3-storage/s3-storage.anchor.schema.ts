import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

/**
 * @group Anchors/S3Storage
 *
 * @hideconstructor
 */
export class S3StorageAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Service;

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
