import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class S3WebsiteSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsRegionId: string;
    Bucket: string;
    ErrorDocument: string;
    IndexDocument: string;
  }>();

  override response = Schema<{
    awsRegionId: string;
  }>();
}
