import { Schema, ServiceSchema } from '@quadnix/octo';

export class AwsS3StaticWebsiteServiceSchema extends ServiceSchema {
  bucketName = Schema<string>();

  excludePaths? = Schema<{ directoryPath: string; subDirectoryOrFilePath: string }[]>([]);

  sourcePaths? = Schema<
    {
      directoryPath: string;
      isDirectory: boolean;
      remotePath: string;
      subDirectoryOrFilePath: string;
    }[]
  >([]);
}
