import { BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Service} model representing an AWS S3 directory.
 *
 * @group Anchors/S3Directory
 *
 * @hideconstructor
 */
export class S3DirectoryAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Service;

  /**
   * Input properties.
   * * `properties.bucketName`: The name of the S3 bucket.
   * * `properties.remoteDirectoryPath`: The path to the directory within the S3 bucket.
   */
  @Validate({
    destruct: (value: S3DirectoryAnchorSchema['properties']): string[] => [value.bucketName, value.remoteDirectoryPath],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    bucketName: string;
    remoteDirectoryPath: string;
  }>();
}
