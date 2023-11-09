import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IS3StorageProperties } from '../s3-storage.interface.js';
import { S3Storage } from '../s3-storage.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteS3StorageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteS3StorageAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 's3-storage';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Storage = diff.model as S3Storage;
    const properties = s3Storage.properties as unknown as IS3StorageProperties;

    // Get instances.
    const s3Client = await Container.get(S3Client, { args: [properties.awsRegionId] });

    // Delete objects.
    let ContinuationToken: string | undefined = undefined;
    do {
      const data = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: properties.Bucket,
          ContinuationToken,
          MaxKeys: 1000,
        }),
      );

      await s3Client.send(
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
    await s3Client.send(
      new DeleteBucketCommand({
        Bucket: properties.Bucket,
      }),
    );
  }
}

@Factory<DeleteS3StorageAction>(DeleteS3StorageAction)
export class DeleteS3StorageActionFactory {
  static async create(): Promise<DeleteS3StorageAction> {
    return new DeleteS3StorageAction();
  }
}
