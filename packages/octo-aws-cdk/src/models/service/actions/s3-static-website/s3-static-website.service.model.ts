import { Diff, DiffAction, Service, StateManagementService } from '@quadnix/octo';
import { lstat, readdir } from 'fs/promises';
import { join, parse, resolve } from 'path';
import { FileUtility } from '../../../../utilities/file/file.utility';
import { IS3StaticWebsiteService } from './s3-static-website.service.interface';

export type IManifest = { [key: string]: { algorithm: 'sha1'; digest: string | 'deleted' } };

export class S3StaticWebsiteService extends Service {
  readonly bucketName: string;

  readonly excludePaths: { directoryPath: string; subDirectoryOrFilePath: string }[] = [];

  readonly sourcePaths: {
    directoryPath: string;
    isDirectory: boolean;
    remotePath: string;
    subDirectoryOrFilePath: string;
  }[] = [];

  constructor(bucketName: string) {
    super(`${bucketName}-s3-static-website`);

    this.bucketName = bucketName;
  }

  async addSource(
    directoryPath: string,
    subDirectoryOrFilePath?: string,
    filter?: (filePath: string) => boolean,
    transform?: (filePath: string) => string,
  ): Promise<void> {
    directoryPath = resolve(directoryPath);
    if (!subDirectoryOrFilePath) {
      subDirectoryOrFilePath = '';
    }

    // Remove leading slashes.
    subDirectoryOrFilePath = subDirectoryOrFilePath.replace(/^\/+/g, '');

    // Ensure subDirectoryOrFilePath exists, and is readable.
    const relativeSubDirectoryOrFilePath = join(directoryPath, subDirectoryOrFilePath);
    const stats = await lstat(relativeSubDirectoryOrFilePath);

    if (stats.isFile()) {
      if (!subDirectoryOrFilePath) {
        const { base, dir } = parse(directoryPath);
        directoryPath = dir;
        subDirectoryOrFilePath = base;
      }

      const shouldInclude = filter ? filter(subDirectoryOrFilePath) : true;
      if (shouldInclude) {
        this.sourcePaths.push({
          directoryPath,
          isDirectory: false,
          remotePath: transform ? transform(subDirectoryOrFilePath) : subDirectoryOrFilePath,
          subDirectoryOrFilePath,
        });
      }
    } else {
      this.sourcePaths.push({
        directoryPath,
        isDirectory: true,
        remotePath: transform ? transform(subDirectoryOrFilePath) : subDirectoryOrFilePath,
        subDirectoryOrFilePath,
      });

      const filePaths = await readdir(relativeSubDirectoryOrFilePath);
      for (let filePath of filePaths) {
        filePath = join(subDirectoryOrFilePath, filePath);

        const shouldInclude = filter ? filter(filePath) : true;
        if (!shouldInclude) {
          this.excludePaths.push({
            directoryPath,
            subDirectoryOrFilePath: filePath,
          });
        }
      }
    }
  }

  override async diff(): Promise<Diff[]> {
    // Get old manifest.
    let oldManifestData: IManifest;
    try {
      const oldManifestDataBuffer = await StateManagementService.getInstance().getBufferState('manifest.json');
      oldManifestData = JSON.parse(oldManifestDataBuffer.toString());
    } catch (error) {
      if (error.code === 'ENOENT') {
        oldManifestData = {};
      } else {
        throw error;
      }
    }

    // Generate new manifest.
    const newManifestData: IManifest = {};
    for (const sourcePath of this.sourcePaths) {
      if (!sourcePath.isDirectory) {
        const digest = await FileUtility.hash(join(sourcePath.directoryPath, sourcePath.subDirectoryOrFilePath));
        newManifestData[sourcePath.remotePath] = { algorithm: 'sha1', digest };
      } else {
        const filePaths = await readdir(join(sourcePath.directoryPath, sourcePath.subDirectoryOrFilePath));
        for (const filePath of filePaths) {
          if (this.excludePaths.findIndex((p) => join(p.directoryPath, p.subDirectoryOrFilePath) === filePath) === -1) {
            const remotePath = join(sourcePath.remotePath, filePath);
            const digest = await FileUtility.hash(
              join(sourcePath.directoryPath, sourcePath.subDirectoryOrFilePath, filePath),
            );
            newManifestData[remotePath] = { algorithm: 'sha1', digest };
          }
        }
      }
    }
    // Save new manifest.
    await StateManagementService.getInstance().saveBufferState(
      'manifest.json',
      Buffer.from(JSON.stringify(newManifestData)),
    );

    // Generate difference in new manifest.
    for (const key of Object.keys(oldManifestData)) {
      if (key in newManifestData) {
        if (
          oldManifestData[key].algorithm === newManifestData[key].algorithm &&
          oldManifestData[key].digest === newManifestData[key].digest
        ) {
          delete newManifestData[key];
        }
      } else {
        newManifestData[key] = { algorithm: 'sha1', digest: 'deleted' };
      }
    }

    return [new Diff(this, DiffAction.UPDATE, 'sourcePaths', newManifestData)];
  }

  override synth(): IS3StaticWebsiteService {
    return {
      bucketName: this.bucketName,
      excludePaths: this.excludePaths,
      serviceId: `${this.bucketName}-s3-static-website`,
      sourcePaths: this.sourcePaths,
    };
  }

  static async unSynth(s3StaticWebsite: IS3StaticWebsiteService): Promise<S3StaticWebsiteService> {
    const service = new S3StaticWebsiteService(s3StaticWebsite.bucketName);
    service.excludePaths.push(...s3StaticWebsite.excludePaths);
    service.sourcePaths.push(...s3StaticWebsite.sourcePaths);
    return service;
  }
}
