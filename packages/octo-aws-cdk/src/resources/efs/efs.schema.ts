import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class EfsSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsRegionId: string;
    filesystemName: string;
  }>();

  override response = Schema<{
    FileSystemId: string;
    FileSystemArn: string;
  }>();
}
