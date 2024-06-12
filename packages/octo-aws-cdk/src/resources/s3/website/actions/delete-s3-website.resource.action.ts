import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import { S3Website } from '../s3-website.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteS3WebsiteResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteS3WebsiteResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE && diff.model instanceof S3Website && diff.model.MODEL_NAME === 's3-website'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.model as S3Website;
    const properties = s3Website.properties;

    // Get instances.
    const s3Client = await Container.get(S3Client, { args: [properties.awsRegionId] });

    // Delete objects.
    let ContinuationToken: string | undefined = undefined;
    do {
      const data = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: properties.Bucket,
          ContinuationToken,
          MaxKeys: 1000,
        }),
      );

      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: properties.Bucket,
          Delete: {
            Objects: data.Contents?.map((l) => ({ Key: l.Key })),
            Quiet: true,
          },
        }),
      );

      ContinuationToken = data.NextContinuationToken;
    } while (ContinuationToken);

    // Delete bucket.
    await s3Client.send(
      new DeleteBucketCommand({
        Bucket: properties.Bucket,
      }),
    );
  }
}

@Factory<DeleteS3WebsiteResourceAction>(DeleteS3WebsiteResourceAction)
export class DeleteS3WebsiteResourceActionFactory {
  static async create(): Promise<DeleteS3WebsiteResourceAction> {
    return new DeleteS3WebsiteResourceAction();
  }
}
