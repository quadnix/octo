import { type Account, AccountSchema, Schema, Validate } from '@quadnix/octo';
import { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';

/**
 * `AwsS3StaticWebsiteServiceModuleSchema` is the input schema for the `AwsS3StaticWebsiteServiceModule` module.
 * This schema defines the configuration for S3-based static website services including bucket naming,
 * source directory management, and file processing options.
 *
 * @group Modules/Service/AwsS3StaticWebsiteService
 *
 * @hideconstructor
 *
 * @see {@link AwsS3StaticWebsiteServiceModule} to learn more about the `AwsS3StaticWebsiteServiceModule` module.
 */
export class AwsS3StaticWebsiteServiceModuleSchema {
  /**
   * The AWS account that this service will be associated with.
   * Only AWS account types are supported for this module.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsAccountAnchorSchema }], NODE_NAME: 'account' },
      },
    },
    {
      destruct: (value: AwsS3StaticWebsiteServiceModuleSchema['account']): [AccountSchema] => [value.synth()],
      options: {
        isSchema: { schema: AccountSchema },
      },
    },
  ])
  account = Schema<Account>();

  /**
   * The AWS region that this service will be associated with.
   */
  @Validate({ options: { minLength: 1 } })
  awsRegionId = Schema<string>();

  /**
   * The name of the S3 bucket to create for the static website.
   * This name must be globally unique across all AWS accounts and regions.
   * Must follow S3 bucket naming conventions.
   */
  @Validate({ options: { minLength: 1 } })
  bucketName = Schema<string>();

  /**
   * The local directory path containing the static website files.
   * This is the source directory that will be synchronized to S3.
   */
  @Validate({ options: { minLength: 1 } })
  directoryPath = Schema<string>();

  /**
   * Optional filter function to exclude specific files from upload.
   * This function receives a file path and returns true to include the file or false to exclude it.
   * Useful for excluding development files, system files, or temporary files.
   */
  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceModuleSchema['filter']): ((filePath: string) => boolean)[] => {
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
   * Optional subdirectory or specific file path within the source directory.
   * When specified, only this subdirectory or file will be uploaded instead of the entire directory.,
   * but the path leading up to this subdirectory or file will still be preserved.
   *
   * For example, if `subDirectoryOrFilePath` is `subdirectory/file.html`, only the file `file.html` will be uploaded,
   * but the path `subdirectory/` will still be preserved. The URL will be `my-website.com/subdirectory/file.html`.
   */
  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceModuleSchema['subDirectoryOrFilePath']): string[] => {
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
    destruct: (value: AwsS3StaticWebsiteServiceModuleSchema['transform']): ((filePath: string) => string)[] => {
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
