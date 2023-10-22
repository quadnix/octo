import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { S3Website } from '../../website/s3-website.resource.js';

export class UpdateRemoveDirectoriesInS3StorageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateRemoveDirectoriesInS3StorageAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 's3-storage' &&
      (diff.model as S3Website).getUpdateMarker()?.key === 'update-delete-directories'
    );
  }

  async handle(): Promise<void> {
    throw new Error('Method not implemented!');
  }
}
