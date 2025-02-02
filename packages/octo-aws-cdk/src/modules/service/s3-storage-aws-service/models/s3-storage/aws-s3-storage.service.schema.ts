import { Schema, ServiceSchema, Validate } from '@quadnix/octo';

export class AwsS3StorageServiceSchema extends ServiceSchema {
  @Validate({ options: { minLength: 1 } })
  bucketName = Schema<string>();

  @Validate({
    destruct: (value: AwsS3StorageServiceSchema['directories']): string[] =>
      value!.map((v) => [v.directoryAnchorName, v.remoteDirectoryPath]).flat(),
    options: { minLength: 1 },
  })
  directories? = Schema<{ directoryAnchorName: string; remoteDirectoryPath: string }[]>([]);
}
