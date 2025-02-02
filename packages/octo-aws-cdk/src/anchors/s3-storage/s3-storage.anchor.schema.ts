import { BaseAnchorSchema, Schema, Validate } from '@quadnix/octo';

export class S3StorageAnchorSchema extends BaseAnchorSchema {
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
