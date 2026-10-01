import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';

/**
 * `AwsS3StorageServiceModuleSchema` is the input schema for the `AwsS3StorageServiceModule` module.
 * This schema defines the configuration for S3-based storage services including bucket naming,
 * region placement, access prefixes, and the local files to upload.
 *
 * @group Modules/Service/AwsS3StorageService
 *
 * @hideconstructor
 *
 * @see {@link AwsS3StorageServiceModule} to learn more about the `AwsS3StorageServiceModule` module.
 */
export class AwsS3StorageServiceModuleSchema {
  /**
   * Optional key prefixes within the S3 bucket, e.g. `uploads`, that other modules may be granted
   * read or write access to. A prefix creates nothing in the bucket; each one publishes an anchor
   * that a module such as `AwsServerModule` grants access through.
   */
  @Validate({
    destruct: (value: AwsS3StorageServiceModuleSchema['accessPrefixes']): string[] => value!,
    options: { minLength: 1 },
  })
  accessPrefixes? = Schema<string[]>([]);

  /**
   * Blocks every public ACL and public policy on the bucket.
   */
  blockPublicAccess? = Schema<boolean>(true);

  /**
   * The name of the S3 bucket to create.
   * This name must be globally unique across all AWS accounts and regions.
   * Must follow S3 bucket naming conventions.
   */
  @Validate({ options: { minLength: 1 } })
  bucketName = Schema<string>();

  /**
   * Optional local directory path containing the files to upload.
   * When set, the directory is synchronized to the bucket. When omitted, nothing is uploaded.
   */
  @Validate({
    destruct: (value: AwsS3StorageServiceModuleSchema['directoryPath']): string[] => {
      const subjects: string[] = [];
      if (value !== null && value !== undefined) {
        subjects.push(value);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  directoryPath? = Schema<string | null>(null);

  /**
   * Optional filter function to exclude specific files from upload.
   * This function receives a file path and returns true to include the file or false to exclude it.
   * Useful for excluding development files, system files, or temporary files.
   */
  @Validate({
    destruct: (value: AwsS3StorageServiceModuleSchema['filter']): ((filePath: string) => boolean)[] => {
      const subjects: ((filePath: string) => boolean)[] = [];
      if (value) {
        subjects.push(value);
      }
      return subjects;
    },
    options: {
      custom: (value: ((filePath: string) => boolean)[]): boolean => value.every((v) => typeof v === 'function'),
    },
  })
  filter? = Schema<((filePath: string) => boolean) | null>(null);

  /**
   * The region the bucket is created in, as produced by any of the AWS region modules.
   */
  @Validate([
    {
      options: {
        isModel: { NODE_NAME: 'region' },
      },
    },
    {
      destruct: (value: AwsS3StorageServiceModuleSchema['region']): [RegionSchema] => [value.synth()],
      options: {
        isSchema: { schema: RegionSchema },
      },
    },
  ])
  region = Schema<Region>();

  /**
   * Optional subdirectory or specific file path within `directoryPath`.
   * When specified, only this subdirectory or file will be uploaded instead of the entire directory,
   * but the path leading up to this subdirectory or file will still be preserved.
   *
   * For example, if `subDirectoryOrFilePath` is `subdirectory/file.html`, only the file `file.html` will be uploaded,
   * but the path `subdirectory/` will still be preserved. Its key in the bucket will be `subdirectory/file.html`.
   */
  @Validate({
    destruct: (value: AwsS3StorageServiceModuleSchema['subDirectoryOrFilePath']): string[] => {
      const subjects: string[] = [];
      if (value) {
        subjects.push(value);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  subDirectoryOrFilePath? = Schema<string | null>(null);

  /**
   * Optional transform function to modify file paths before upload.
   * This function receives the original file path and returns the transformed path.
   * Useful for renaming files, changing directory structures, or modifying extensions.
   */
  @Validate({
    destruct: (value: AwsS3StorageServiceModuleSchema['transform']): ((filePath: string) => string)[] => {
      const subjects: ((filePath: string) => string)[] = [];
      if (value) {
        subjects.push(value);
      }
      return subjects;
    },
    options: {
      custom: (value: ((filePath: string) => string)[]): boolean => value.every((v) => typeof v === 'function'),
    },
  })
  transform? = Schema<((filePath: string) => string) | null>(null);
}
