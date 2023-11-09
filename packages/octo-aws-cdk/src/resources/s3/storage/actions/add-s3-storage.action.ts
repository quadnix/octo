import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IS3StorageProperties } from '../s3-storage.interface.js';
import { S3Storage } from '../s3-storage.resource.js';

@Action(ModelType.RESOURCE)
export class AddS3StorageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddS3StorageAction';

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

@Factory<AddS3StorageAction>(AddS3StorageAction)
export class AddS3StorageActionFactory {
  static async create(): Promise<AddS3StorageAction> {
    return new AddS3StorageAction();
  }
}
