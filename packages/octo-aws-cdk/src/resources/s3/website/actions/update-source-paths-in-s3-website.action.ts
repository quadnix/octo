import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { createReadStream } from 'fs';
import * as mime from 'mime';
import { IS3WebsiteProperties } from '../s3-website.interface';
import { S3Website } from '../s3-website.resource';

export class UpdateSourcePathsInS3WebsiteAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateSourcePathsInS3WebsiteAction';

  constructor(private readonly s3Client: S3Client) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 's3-website' &&
      (diff.model as S3Website).diffMarkers.update?.key === 'update-source-paths'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.model as S3Website;
    const manifestDiff: { [key: string]: ['add' | 'delete' | 'update', string] } = s3Website.diffMarkers.update!.value;
    const properties = s3Website.properties as unknown as IS3WebsiteProperties;

    // Synchronize files with S3.
    for (const remotePath of Object.keys(manifestDiff)) {
      const [operation, filePath] = manifestDiff[remotePath];
      if (operation === 'add' || operation === 'update') {
        const stream = createReadStream(filePath);
        const upload = new Upload({
          client: this.s3Client,
          leavePartsOnError: false,
          params: {
            Body: stream,
            Bucket: properties.Bucket,
            ContentType: mime.getType(filePath),
            Key: remotePath,
          },
          queueSize: 4,
        });
        await upload.done();
      } else {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: properties.Bucket,
            Key: remotePath,
          }),
        );
      }
    }
  }
}
