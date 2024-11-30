import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class S3StorageSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsRegionId: string;
    Bucket: string;
  }>();

  override response = Schema<Record<string, never>>();
}
