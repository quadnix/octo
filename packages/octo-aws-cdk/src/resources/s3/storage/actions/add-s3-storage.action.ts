import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IS3StorageProperties } from '../s3-storage.interface.js';
import { S3Storage } from '../s3-storage.resource.js';

export class AddS3StorageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddS3StorageAction';

  constructor(private readonly s3Client: S3Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 's3-storage';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Storage = diff.model as S3Storage;
    const properties = s3Storage.properties as unknown as IS3StorageProperties;

    // Create a new bucket.
    await this.s3Client.send(
      new CreateBucketCommand({
        Bucket: properties.Bucket,
      }),
    );
  }
}
