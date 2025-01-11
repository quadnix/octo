import { Schema, ServiceSchema } from '@quadnix/octo';

export class AwsS3StorageServiceSchema extends ServiceSchema {
  bucketName = Schema<string>();

  directories? = Schema<{ directoryAnchorName: string; remoteDirectoryPath: string }[]>([]);
}
