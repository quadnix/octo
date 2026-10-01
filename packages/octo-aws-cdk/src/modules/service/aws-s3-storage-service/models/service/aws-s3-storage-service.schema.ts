import { Schema, ServiceSchema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsS3StorageServiceSchema extends ServiceSchema {
  @Validate({
    destruct: (value: AwsS3StorageServiceSchema['accessPrefixes']): string[] =>
      value!.map((v) => [v.accessPrefixAnchorName, v.accessPrefix]).flat(),
    options: { minLength: 1 },
  })
  accessPrefixes? = Schema<{ accessPrefix: string; accessPrefixAnchorName: string }[]>([]);

  @Validate({ options: { minLength: 1 } })
  bucketName = Schema<string>();

  @Validate({
    destruct: (value: AwsS3StorageServiceSchema['excludePaths']): string[] =>
      value!.map((v) => [v.directoryPath, v.subDirectoryOrFilePath]).flat(),
    options: { minLength: 1 },
  })
  excludePaths? = Schema<{ directoryPath: string; subDirectoryOrFilePath: string }[]>([]);

  @Validate({
    destruct: (value: AwsS3StorageServiceSchema['sourcePaths']): string[] =>
      value!.map((v) => [v.directoryPath, String(v.isDirectory), v.remotePath, v.subDirectoryOrFilePath]).flat(),
    options: { minLength: 1 },
  })
  sourcePaths? = Schema<
    {
      directoryPath: string;
      isDirectory: boolean;
      remotePath: string;
      subDirectoryOrFilePath: string;
    }[]
  >([]);
}
