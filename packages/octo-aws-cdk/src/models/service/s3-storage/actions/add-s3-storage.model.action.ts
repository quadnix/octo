import { Action, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { S3Storage } from '../../../../resources/s3/storage/s3-storage.resource.js';
import { AAction } from '../../../action.abstract.js';
import { S3StorageService } from '../s3-storage.service.model.js';

@Action(ModelType.MODEL)
export class AddS3StorageModelAction extends AAction {
  readonly ACTION_NAME: string = 'AddS3StorageModelAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId' &&
      (diff.model as S3StorageService).serviceId.endsWith('s3-storage')
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
}

@Factory<AddS3StorageModelAction>(AddS3StorageModelAction)
export class AddS3StorageModelActionFactory {
  static async create(): Promise<AddS3StorageModelAction> {
    return new AddS3StorageModelAction();
  }
}
