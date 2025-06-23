import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { S3ClientFactory } from '../../../factories/aws-client.factory.js';
import { S3Storage } from '../s3-storage.resource.js';

@Action(S3Storage)
export class AddS3StorageResourceAction implements IResourceAction<S3Storage> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof S3Storage &&
      (diff.node.constructor as typeof S3Storage).NODE_NAME === 's3-storage' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Storage = diff.node as S3Storage;
    const properties = s3Storage.properties;
    const response = s3Storage.response;

    // Get instances.
    const s3Client = await this.container.get<S3Client, typeof S3ClientFactory>(S3Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create a new bucket.
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: properties.Bucket,
      }),
    );

    // Set response.
    response.Arn = `arn:aws:s3:::${properties.Bucket}`;
  }

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const s3Storage = diff.node as S3Storage;
    const properties = s3Storage.properties;

    const s3Client = await this.container.get<S3Client, typeof S3ClientFactory>(S3Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    s3Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateBucketCommand) {
        return;
      }
    };
  }
}

@Factory<AddS3StorageResourceAction>(AddS3StorageResourceAction)
export class AddS3StorageResourceActionFactory {
  private static instance: AddS3StorageResourceAction;

  static async create(): Promise<AddS3StorageResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddS3StorageResourceAction(container);
    }
    return this.instance;
  }
}
