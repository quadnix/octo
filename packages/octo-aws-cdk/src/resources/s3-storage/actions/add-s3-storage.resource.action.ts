import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { S3ClientFactory } from '../../../factories/aws-client.factory.js';
import type { S3StorageSchema } from '../index.schema.js';
import { S3Storage } from '../s3-storage.resource.js';

/**
 * @internal
 */
@Action(S3Storage)
export class AddS3StorageResourceAction implements IResourceAction<S3Storage> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof S3Storage &&
      hasNodeName(diff.node, 's3-storage') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<S3Storage>): Promise<S3StorageSchema['response']> {
    // Get properties.
    const s3Storage = diff.node;
    const properties = s3Storage.properties;

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

    return {
      Arn: `arn:aws:s3:::${properties.Bucket}`,
    };
  }

  async mock(diff: Diff<S3Storage>): Promise<S3StorageSchema['response']> {
    // Get properties.
    const s3Storage = diff.node;
    const properties = s3Storage.properties;

    return {
      Arn: `arn:aws:s3:::${properties.Bucket}`,
    };
  }
}

/**
 * @internal
 */
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
