import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { S3ClientFactory } from '../../../factories/aws-client.factory.js';
import { S3Website } from '../s3-website.resource.js';

/**
 * @internal
 */
@Action(S3Website)
export class DeleteS3WebsiteResourceAction implements IResourceAction<S3Website> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof S3Website &&
      hasNodeName(diff.node, 's3-website') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<S3Website>): Promise<void> {
    // Get properties.
    const s3Website = diff.node;
    const properties = s3Website.properties;

    // Get instances.
    const s3Client = await this.container.get<S3Client, typeof S3ClientFactory>(S3Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete objects.
    let ContinuationToken: string | undefined = undefined;
    do {
      const data: ListObjectsV2CommandOutput = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: properties.Bucket,
          ContinuationToken,
          MaxKeys: 1000,
        }),
      );

      if (!data.Contents || data.Contents.length === 0) {
        break;
      }

      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: properties.Bucket,
          Delete: {
            Objects: data.Contents.map((l) => ({ Key: l.Key })),
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

/**
 * @internal
 */
@Factory<DeleteS3WebsiteResourceAction>(DeleteS3WebsiteResourceAction)
export class DeleteS3WebsiteResourceActionFactory {
  private static instance: DeleteS3WebsiteResourceAction;

  static async create(): Promise<DeleteS3WebsiteResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteS3WebsiteResourceAction(container);
    }
    return this.instance;
  }
}
