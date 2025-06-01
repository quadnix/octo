import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

export class S3DirectoryAnchorSchema extends BaseAnchorSchema {
  parentInstance: Service;

  @Validate({
    destruct: (value: S3DirectoryAnchorSchema['properties']): string[] => [value.bucketName, value.remoteDirectoryPath],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    bucketName: string;
    remoteDirectoryPath: string;
  }>();
}
