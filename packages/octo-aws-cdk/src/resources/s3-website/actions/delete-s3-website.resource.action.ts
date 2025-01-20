import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { S3Website } from '../s3-website.resource.js';

@Action(S3Website)
export class DeleteS3WebsiteResourceAction implements IResourceAction<S3Website> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof S3Website &&
      (diff.node.constructor as typeof S3Website).NODE_NAME === 's3-website' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.node as S3Website;
    const properties = s3Website.properties;

    // Get instances.
    const s3Client = await this.container.get(S3Client, {
      metadata: { awsAccountId: properties.awsAccountId, awsRegionId: properties.awsRegionId, package: '@octo' },
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

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.node as S3Website;
    const properties = s3Website.properties;

    const s3Client = await this.container.get(S3Client, {
      metadata: { awsAccountId: properties.awsAccountId, awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    s3Client.send = async (instance: unknown): Promise<unknown> => {
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
  private static instance: DeleteS3WebsiteResourceAction;

  static async create(): Promise<DeleteS3WebsiteResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteS3WebsiteResourceAction(container);
    }
    return this.instance;
  }
}
