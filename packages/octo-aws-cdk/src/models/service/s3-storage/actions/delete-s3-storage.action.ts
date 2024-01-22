import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { S3Storage } from '../../../../resources/s3/storage/s3-storage.resource.js';
import { AAction } from '../../../action.abstract.js';
import { S3StorageService } from '../s3-storage.service.model.js';

@Action(ModelType.MODEL)
export class DeleteS3StorageAction extends AAction {
  readonly ACTION_NAME: string = 'DeleteS3StorageAction';

  override collectInput(diff: Diff): string[] {
    const { bucketName } = diff.model as S3StorageService;

    return [`resource.bucket-${bucketName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId' &&
      (diff.model as S3StorageService).serviceId.endsWith('s3-storage')
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const { bucketName } = diff.model as S3StorageService;

    const s3Storage = actionInputs[`resource.bucket-${bucketName}`] as S3Storage;
    s3Storage.markDeleted();

    const output: ActionOutputs = {};
    output[s3Storage.resourceId] = s3Storage;

    return output;
  }
}

@Factory<DeleteS3StorageAction>(DeleteS3StorageAction)
export class DeleteS3StorageActionFactory {
  static async create(): Promise<DeleteS3StorageAction> {
    return new DeleteS3StorageAction();
  }
}
