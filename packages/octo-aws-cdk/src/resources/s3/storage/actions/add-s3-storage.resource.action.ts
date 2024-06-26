import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Action, Container, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import type { Diff } from '@quadnix/octo';
import type { IS3StorageProperties } from '../s3-storage.interface.js';
import type { S3Storage } from '../s3-storage.resource.js';

@Action(ModelType.RESOURCE)
export class AddS3StorageResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddS3StorageResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 's3-storage';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Storage = diff.model as S3Storage;
    const properties = s3Storage.properties as unknown as IS3StorageProperties;

    // Get instances.
    const s3Client = await Container.get(S3Client, { args: [properties.awsRegionId] });

    // Create a new bucket.
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: properties.Bucket,
      }),
    );
  }
}

@Factory<AddS3StorageResourceAction>(AddS3StorageResourceAction)
export class AddS3StorageResourceActionFactory {
  static async create(): Promise<AddS3StorageResourceAction> {
    return new AddS3StorageResourceAction();
  }
}
