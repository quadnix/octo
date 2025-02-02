import { Schema, ServiceSchema, Validate } from '@quadnix/octo';

export class AwsS3StaticWebsiteServiceSchema extends ServiceSchema {
  @Validate({ options: { minLength: 1 } })
  bucketName = Schema<string>();

  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceSchema['excludePaths']): string[] =>
      value!.map((v) => [v.directoryPath, v.subDirectoryOrFilePath]).flat(),
    options: { minLength: 1 },
  })
  excludePaths? = Schema<{ directoryPath: string; subDirectoryOrFilePath: string }[]>([]);

  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceSchema['sourcePaths']): string[] =>
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
