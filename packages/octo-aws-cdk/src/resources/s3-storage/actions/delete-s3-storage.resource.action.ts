import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { S3ClientFactory } from '../../../factories/aws-client.factory.js';
import { S3Storage } from '../s3-storage.resource.js';

/**
 * @internal
 */
@Action(S3Storage)
export class DeleteS3StorageResourceAction implements IResourceAction<S3Storage> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof S3Storage &&
      hasNodeName(diff.node, 's3-storage') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<S3Storage>): Promise<void> {
    // Get properties.
    const s3Storage = diff.node;
    const properties = s3Storage.properties;

    // Get instances.
    const s3Client = await this.container.get<S3Client, typeof S3ClientFactory>(S3Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete objects.
    let ContinuationToken: string | undefined = undefined;
    do {
      const data: ListObjectsV2CommandOutput = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: properties.Bucket,
          ContinuationToken,
          MaxKeys: 1000,
        }),
      );

      if (!data.Contents || data.Contents.length === 0) {
        break;
      }

      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: properties.Bucket,
          Delete: {
            Objects: data.Contents.map((l) => ({ Key: l.Key })),
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

/**
 * @internal
 */
@Factory<DeleteS3StorageResourceAction>(DeleteS3StorageResourceAction)
export class DeleteS3StorageResourceActionFactory {
  private static instance: DeleteS3StorageResourceAction;

  static async create(): Promise<DeleteS3StorageResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteS3StorageResourceAction(container);
    }
    return this.instance;
  }
}
