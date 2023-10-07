import { Diff, DiffAction, IActionInputs, IActionOutputs } from '@quadnix/octo';
import { S3Storage } from '../../../../resources/s3/storage/s3-storage.resource';
import { Action } from '../../../action.abstract';
import { S3StorageService } from '../s3-storage.service.model';

export class DeleteS3StorageAction extends Action {
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

  handle(diff: Diff, actionInputs: IActionInputs): IActionOutputs {
    const { bucketName } = diff.model as S3StorageService;

    const s3Storage = actionInputs[`resource.bucket-${bucketName}`] as S3Storage;

    // Delete S3 Website.
    s3Storage.markDeleted();

    return {};
  }
}
