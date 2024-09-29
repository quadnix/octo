import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { S3Storage } from '../s3-storage.resource.js';

@Action(S3Storage)
export class AddS3StorageResourceAction implements IResourceAction {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof S3Storage &&
      (diff.node.constructor as typeof S3Storage).NODE_NAME === 's3-storage'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Storage = diff.node as S3Storage;
    const properties = s3Storage.properties;

    // Get instances.
    const s3Client = await Container.get(S3Client, { args: [properties.awsRegionId] });

    // Create a new bucket.
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: properties.Bucket,
      }),
    );
  }

  async mock(): Promise<void> {
    const s3Client = await Container.get(S3Client, { args: ['mock'] });
    s3Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreateBucketCommand) {
        return;
      }
    };
  }
}

@Factory<AddS3StorageResourceAction>(AddS3StorageResourceAction)
export class AddS3StorageResourceActionFactory {
  static async create(): Promise<AddS3StorageResourceAction> {
    return new AddS3StorageResourceAction();
  }
}
