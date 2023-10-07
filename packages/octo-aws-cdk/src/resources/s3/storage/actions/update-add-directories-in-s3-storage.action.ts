import { S3Client } from '@aws-sdk/client-s3';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { S3Website } from '../../website/s3-website.resource';

export class UpdateAddDirectoriesInS3StorageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateAddDirectoriesInS3StorageAction';

  constructor(private readonly s3Client: S3Client) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 's3-storage' &&
      (diff.model as S3Website).getUpdateMarker()?.key === 'update-add-directories'
    );
  }

  async handle(diff: Diff): Promise<void> {
    throw new Error('Method not implemented!');
  }
}
