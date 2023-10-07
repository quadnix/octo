import { Diff, DiffAction, IActionOutputs } from '@quadnix/octo';
import { S3Storage } from '../../../../resources/s3/storage/s3-storage.resource';
import { Action } from '../../../action.abstract';
import { S3StorageService } from '../s3-storage.service.model';

export class AddS3StorageAction extends Action {
  readonly ACTION_NAME: string = 'AddS3StorageAction';

  override collectOutput(diff: Diff): string[] {
    const { bucketName } = diff.model as S3StorageService;

    return [`bucket-${bucketName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId' &&
      (diff.model as S3StorageService).serviceId.endsWith('s3-storage')
    );
  }

  handle(diff: Diff): IActionOutputs {
    const { bucketName } = diff.model as S3StorageService;

    // Create S3 Bucket.
    const s3Storage = new S3Storage(`bucket-${bucketName}`, {
      Bucket: bucketName,
    });

    const output: IActionOutputs = {};
    output[s3Storage.resourceId] = s3Storage;

    return output;
  }
}
