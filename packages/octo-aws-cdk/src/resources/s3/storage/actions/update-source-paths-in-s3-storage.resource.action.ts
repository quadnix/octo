import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import { createReadStream } from 'fs';
import mime from 'mime';
import { S3Storage } from '../s3-storage.resource.js';

@Action(ModelType.RESOURCE)
export class UpdateSourcePathsInS3StorageResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateSourcePathsInS3StorageResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model instanceof S3Storage &&
      diff.model.MODEL_NAME === 's3-storage' &&
      diff.field === 'update-source-paths'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const manifestDiff = diff.value as S3Storage['manifestDiff'];
    const s3Storage = diff.model as S3Storage;
    const properties = s3Storage.properties;

    // Get instances.
    const s3Client = await Container.get(S3Client, { args: [properties.awsRegionId] });

    // Synchronize files with S3.
    for (const remotePath in manifestDiff) {
      const [operation, filePath] = manifestDiff[remotePath];
      if (operation === 'add') {
        const stream = createReadStream(filePath);
        const upload = new Upload({
          client: s3Client,
          leavePartsOnError: false,
          params: {
            Body: stream,
            Bucket: properties.Bucket,
            ContentType: mime.getType(filePath) || undefined,
            Key: remotePath,
          },
          queueSize: 4,
        });
        await upload.done();
      } else if (operation === 'deleteDirectory') {
        let ContinuationToken: string | undefined = undefined;
        do {
          const data = await s3Client.send(
            new ListObjectsV2Command({
              Bucket: properties.Bucket,
              ContinuationToken,
              MaxKeys: 1000,
              Prefix: remotePath,
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
      } else {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: properties.Bucket,
            Key: remotePath,
          }),
        );
      }
    }
  }

  async mock(): Promise<void> {
    const s3Client = await Container.get(S3Client);
    s3Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof ListObjectsV2Command) {
        return { Contents: [], NextContinuationToken: undefined };
      } else if (instance instanceof DeleteObjectsCommand) {
        return;
      } else if (instance instanceof DeleteObjectCommand) {
        return;
      }
    };
  }
}

@Factory<UpdateSourcePathsInS3StorageResourceAction>(UpdateSourcePathsInS3StorageResourceAction)
export class UpdateSourcePathsInS3StorageResourceActionFactory {
  static async create(): Promise<UpdateSourcePathsInS3StorageResourceAction> {
    return new UpdateSourcePathsInS3StorageResourceAction();
  }
}
