import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Diff, DiffAction, IAction, IActionInputRequest, StateManagementService } from '@quadnix/octo';
import { createReadStream } from 'fs';
import * as mime from 'mime';
import { IManifest, S3StaticWebsiteService } from '../s3-static-website.service.model';

export class UpdateSourcePathsS3StaticWebsiteAction implements IAction {
  readonly ACTION_NAME: string = 'updateSourcePathsS3StaticWebsiteAction';

  private oldManifestDataCache: IManifest;

  private readonly s3Client: S3Client;

  constructor(s3Client: S3Client) {
    this.s3Client = s3Client;
  }

  collectInput(): IActionInputRequest {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'sourcePaths' &&
      (diff.model as S3StaticWebsiteService).serviceId.endsWith('s3-static-website')
    );
  }

  async handle(diff: Diff): Promise<void> {
    const { bucketName } = diff.model as S3StaticWebsiteService;
    const manifestFileName = `${bucketName}-manifest.json`;

    // Get old manifest.
    let oldManifestData: IManifest;
    try {
      const oldManifestDataBuffer = await StateManagementService.getInstance().getBufferState(manifestFileName);
      oldManifestData = JSON.parse(oldManifestDataBuffer.toString());
    } catch (error) {
      if (error.code === 'ENOENT') {
        oldManifestData = {};
      } else {
        throw error;
      }
    }
    this.oldManifestDataCache = oldManifestData;

    // Get new manifest.
    const newManifestData = diff.value as IManifest;

    // Generate difference in new manifest.
    const manifestData = {};
    for (const key of Object.keys(oldManifestData)) {
      if (key in newManifestData) {
        if (
          oldManifestData[key].algorithm !== newManifestData[key].algorithm ||
          oldManifestData[key].digest !== newManifestData[key].digest
        ) {
          manifestData[key] = 'update';
        }
      } else {
        manifestData[key] = 'delete';
      }
    }
    for (const key of Object.keys(newManifestData)) {
      if (!(key in oldManifestData)) {
        manifestData[key] = 'add';
      }
    }

    // Synchronize files with S3.
    for (const remotePath of Object.keys(manifestData)) {
      if (manifestData[remotePath] === 'add' || manifestData[remotePath] === 'update') {
        const stream = createReadStream(newManifestData[remotePath].filePath);
        const upload = new Upload({
          client: this.s3Client,
          leavePartsOnError: false,
          params: {
            Body: stream,
            Bucket: bucketName,
            ContentType: mime.getType(newManifestData[remotePath].filePath),
            Key: remotePath,
          },
          queueSize: 4,
        });
        await upload.done();
      } else {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: remotePath,
          }),
        );
      }
    }

    // Save new manifest.
    await StateManagementService.getInstance().saveBufferState(
      manifestFileName,
      Buffer.from(JSON.stringify(newManifestData)),
    );
  }

  async revert(): Promise<void> {
    throw new Error('Method not implemented!');
  }
}
