import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  ModelType,
} from '@quadnix/octo';
import type { S3Storage } from '../../../../resources/s3/storage/s3-storage.resource.js';
import { S3StorageService } from '../s3-storage.service.model.js';

@Action(ModelType.MODEL)
export class DeleteS3StorageModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteS3StorageModelAction';

  collectInput(diff: Diff): string[] {
    const { bucketName } = diff.model as S3StorageService;

    return [`resource.bucket-${bucketName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof S3StorageService &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId'
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

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteS3StorageModelAction>(DeleteS3StorageModelAction)
export class DeleteS3StorageModelActionFactory {
  static async create(): Promise<DeleteS3StorageModelAction> {
    return new DeleteS3StorageModelAction();
  }
}
