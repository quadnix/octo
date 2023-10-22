import { Diff, DiffAction, IActionInputs, IActionOutputs } from '@quadnix/octo';
import { S3Storage } from '../../../../resources/s3/storage/s3-storage.resource.js';
import { Action } from '../../../action.abstract.js';
import { S3StorageService } from '../s3-storage.service.model.js';

export class UpdateDirectoriesS3StorageAction extends Action {
  readonly ACTION_NAME: string = 'UpdateDirectoriesS3StorageAction';

  override collectInput(diff: Diff): string[] {
    const { bucketName } = diff.model as S3StorageService;

    return [`resource.bucket-${bucketName}`];
  }

  filter(diff: Diff): boolean {
    return (
      (diff.action === DiffAction.ADD || diff.action === DiffAction.DELETE) &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'directories' &&
      (diff.model as S3StorageService).serviceId.endsWith('s3-storage')
    );
  }

  handle(diff: Diff, actionInputs: IActionInputs): IActionOutputs {
    const { bucketName } = diff.model as S3StorageService;
    const diffAction = diff.action.toLowerCase();

    const s3Storage = actionInputs[`resource.bucket-${bucketName}`] as S3Storage;

    // Update website source paths.
    s3Storage.markUpdated(`update-${diffAction}-directories`, diff.value);

    return {};
  }
}
