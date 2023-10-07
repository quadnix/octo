import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IS3StorageProperties } from '../s3-storage.interface';
import { S3Storage } from '../s3-storage.resource';

export class DeleteS3StorageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteS3StorageAction';

  constructor(private readonly s3Client: S3Client) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 's3-storage';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Storage = diff.model as S3Storage;
    const properties = s3Storage.properties as unknown as IS3StorageProperties;

    // Delete objects.
    let ContinuationToken: string | undefined = undefined;
    do {
      const data = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: properties.Bucket,
          ContinuationToken,
        }),
      );

      await this.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: properties.Bucket,
          Delete: {
            Objects: data.Contents?.map((l) => ({ Key: l.Key })),
            Quiet: true,
          },
        }),
      );

      ContinuationToken = data.NextContinuationToken;
    } while (ContinuationToken);

    // Delete bucket.
    await this.s3Client.send(
      new DeleteBucketCommand({
        Bucket: properties.Bucket,
      }),
    );
  }
}
