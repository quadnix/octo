import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { S3Website } from '../s3-website.resource.js';

@Action(S3Website)
export class DeleteS3WebsiteResourceAction implements IResourceAction {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof S3Website &&
      (diff.node.constructor as typeof S3Website).NODE_NAME === 's3-website'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.node as S3Website;
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

  async mock(): Promise<void> {
    const s3Client = await Container.get(S3Client, { args: ['mock'] });
    s3Client.send = async (instance): Promise<unknown> => {
      if (instance instanceof ListObjectsV2Command) {
        return { Contents: [], NextContinuationToken: undefined };
      } else if (instance instanceof DeleteObjectsCommand) {
        return;
      } else if (instance instanceof DeleteBucketCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteS3WebsiteResourceAction>(DeleteS3WebsiteResourceAction)
export class DeleteS3WebsiteResourceActionFactory {
  static async create(): Promise<DeleteS3WebsiteResourceAction> {
    return new DeleteS3WebsiteResourceAction();
  }
}
