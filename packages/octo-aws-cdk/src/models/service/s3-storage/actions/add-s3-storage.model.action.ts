import { Action, DiffAction, Factory, ModelType } from '@quadnix/octo';
import type { ActionOutputs, Diff, IModelAction } from '@quadnix/octo';
import { S3Storage } from '../../../../resources/s3/storage/s3-storage.resource.js';
import { S3StorageService } from '../s3-storage.service.model.js';

@Action(ModelType.MODEL)
export class AddS3StorageModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddS3StorageModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof S3StorageService &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId'
    );
  }

  async handle(diff: Diff): Promise<ActionOutputs> {
    const { awsRegionId, bucketName } = diff.model as S3StorageService;

    // Create S3 Bucket.
    const s3Storage = new S3Storage(`bucket-${bucketName}`, {
      awsRegionId,
      Bucket: bucketName,
    });

    const output: ActionOutputs = {};
    output[s3Storage.resourceId] = s3Storage;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddS3StorageModelAction>(AddS3StorageModelAction)
export class AddS3StorageModelActionFactory {
  static async create(): Promise<AddS3StorageModelAction> {
    return new AddS3StorageModelAction();
  }
}
