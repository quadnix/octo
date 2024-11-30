import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { createReadStream } from 'fs';
import mime from 'mime';
import { S3Storage } from '../s3-storage.resource.js';

@Action(S3Storage)
export class UpdateSourcePathsInS3StorageResourceAction implements IResourceAction<S3Storage> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof S3Storage &&
      (diff.node.constructor as typeof S3Storage).NODE_NAME === 's3-storage' &&
      diff.field === 'update-source-paths'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const manifestDiff = diff.value as S3Storage['manifestDiff'];
    const s3Storage = diff.node as S3Storage;
    const properties = s3Storage.properties;

    // Get instances.
    const s3Client = await this.container.get(S3Client, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

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
          const data: ListObjectsV2CommandOutput = await s3Client.send(
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

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const s3Storage = diff.node as S3Storage;
    const properties = s3Storage.properties;

    const s3Client = await this.container.get(S3Client, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    s3Client.send = async (instance: unknown): Promise<unknown> => {
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
    const container = Container.getInstance();
    return new UpdateSourcePathsInS3StorageResourceAction(container);
  }
}
