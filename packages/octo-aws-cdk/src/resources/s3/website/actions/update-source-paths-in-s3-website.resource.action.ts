import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import { createReadStream } from 'fs';
import mime from 'mime';
import type { IS3WebsiteProperties } from '../s3-website.interface.js';
import { S3Website } from '../s3-website.resource.js';

@Action(ModelType.RESOURCE)
export class UpdateSourcePathsInS3WebsiteResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateSourcePathsInS3WebsiteResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model instanceof S3Website &&
      diff.model.MODEL_NAME === 's3-website' &&
      diff.field === 'update-source-paths'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const manifestDiff = diff.value as S3Website['manifestDiff'];
    const s3Website = diff.model as S3Website;
    const properties = s3Website.properties as unknown as IS3WebsiteProperties;

    // Get instances.
    const s3Client = await Container.get(S3Client, { args: [properties.awsRegionId] });

    // Synchronize files with S3.
    for (const remotePath in manifestDiff) {
      const [operation, filePath] = manifestDiff[remotePath];
      if (operation === 'add' || operation === 'update') {
        const stream = createReadStream(filePath);
        const upload = new Upload({
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
}

@Factory<UpdateSourcePathsInS3WebsiteResourceAction>(UpdateSourcePathsInS3WebsiteResourceAction)
export class UpdateSourcePathsInS3WebsiteResourceActionFactory {
  static async create(): Promise<UpdateSourcePathsInS3WebsiteResourceAction> {
    return new UpdateSourcePathsInS3WebsiteResourceAction();
  }
}
