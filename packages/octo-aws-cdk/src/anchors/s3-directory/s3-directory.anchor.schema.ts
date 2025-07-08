import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

/**
 * @group Anchors/S3Directory
 *
 * @hideconstructor
 */
export class S3DirectoryAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
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
