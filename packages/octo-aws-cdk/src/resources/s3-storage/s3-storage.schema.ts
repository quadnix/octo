import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class S3StorageSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsRegionId: string;
    Bucket: string;
    permissions: {
      allowRead: boolean;
      allowWrite: boolean;
      principalResourceId: string;
      remoteDirectoryPath: string;
    }[];
  }>();

  override response = Schema<Record<never, never>>();
}
