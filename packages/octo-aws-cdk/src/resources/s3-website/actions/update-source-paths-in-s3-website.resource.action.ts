import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Upload } from '@aws-sdk/lib-storage';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { createReadStream } from 'fs';
import mime from 'mime';
import type { S3ClientFactory } from '../../../factories/aws-client.factory.js';
import { S3Website } from '../s3-website.resource.js';

@Action(S3Website)
export class UpdateSourcePathsInS3WebsiteResourceAction implements IResourceAction<S3Website> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof S3Website &&
      (diff.node.constructor as typeof S3Website).NODE_NAME === 's3-website' &&
      diff.field === 'update-source-paths'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const manifestDiff = diff.value as S3Website['manifestDiff'];
    const s3Website = diff.node as S3Website;
    const properties = s3Website.properties;

    // Get instances.
    const s3Client = await this.container.get<S3Client, typeof S3ClientFactory>(S3Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    const UploadClient = await this.container.get<typeof Upload>('Upload', {
      metadata: { package: '@octo' },
    });

    // Synchronize files with S3.
    for (const remotePath in manifestDiff) {
      const [operation, filePath] = manifestDiff[remotePath];
      if (operation === 'add' || operation === 'update') {
        const stream = createReadStream(filePath);
        const upload = new UploadClient({
          client: s3Client,
          leavePartsOnError: false,
          params: {
            Body: stream,
            Bucket: properties.Bucket,
            ContentType: mime.getType(filePath) || undefined,
            Key: remotePath,
          },
          queueSize: 4,
        });
        await upload.done();
      } else {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: properties.Bucket,
            Key: remotePath,
          }),
        );
      }
    }
  }

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.node as S3Website;
    const properties = s3Website.properties;

    const s3Client = await this.container.get<S3Client, typeof S3ClientFactory>(S3Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    s3Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DeleteObjectCommand) {
        return;
      }
    };
  }
}

@Factory<UpdateSourcePathsInS3WebsiteResourceAction>(UpdateSourcePathsInS3WebsiteResourceAction)
export class UpdateSourcePathsInS3WebsiteResourceActionFactory {
  private static instance: UpdateSourcePathsInS3WebsiteResourceAction;

  static async create(): Promise<UpdateSourcePathsInS3WebsiteResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateSourcePathsInS3WebsiteResourceAction(container);
    }
    return this.instance;
  }
}
