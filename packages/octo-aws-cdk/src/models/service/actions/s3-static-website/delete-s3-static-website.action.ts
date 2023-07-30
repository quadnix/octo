import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Diff, DiffAction, IAction, IActionInputRequest } from '@quadnix/octo';
import { S3StaticWebsiteService } from './s3-static-website.service.model';

export class DeleteS3StaticWebsiteAction implements IAction {
  readonly ACTION_NAME: string = 'deleteS3StaticWebsiteAction';

  private readonly s3Client: S3Client;

  constructor(s3Client: S3Client) {
    this.s3Client = s3Client;
  }

  collectInput(): IActionInputRequest {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId' &&
      (diff.model as S3StaticWebsiteService).serviceId.endsWith('s3-static-website')
    );
  }

  async handle(diff: Diff): Promise<void> {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    // Delete objects.
    let ContinuationToken: string | undefined = undefined;
    do {
      const data = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken,
        }),
      );

      await this.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: data.Contents?.map((l) => ({ Key: l.Key })),
            Quiet: true,
          },
        }),
      );

      ContinuationToken = data.NextContinuationToken;
    } while (ContinuationToken);

    // Delete bucket.
    await this.s3Client.send(
      new DeleteBucketCommand({
        Bucket: bucketName,
      }),
    );
  }

  async revert(): Promise<void> {
    throw new Error('Method not implemented!');
  }
}
