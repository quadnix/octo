import { Diff, DiffAction, Service, StateManagementService } from '@quadnix/octo';
import { lstat, readdir } from 'fs/promises';
import { join, parse, resolve } from 'path';
import { FileUtility } from '../../../utilities/file/file.utility';
import { IS3StaticWebsiteService } from './s3-static-website.service.interface';

type IManifest = { [key: string]: { algorithm: 'sha1'; digest: string | 'deleted'; filePath: string } };

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

  private async generateSourceManifest(): Promise<IManifest> {
    const manifest: IManifest = {};

    for (const sourcePath of this.sourcePaths) {
      if (!sourcePath.isDirectory) {
        const filePath = join(sourcePath.directoryPath, sourcePath.subDirectoryOrFilePath);
        const digest = await FileUtility.hash(filePath);
        manifest[sourcePath.remotePath] = { algorithm: 'sha1', digest, filePath };
      } else {
        const directoryPath = join(sourcePath.directoryPath, sourcePath.subDirectoryOrFilePath);
        const directoryFilePaths = await readdir(directoryPath);
        for (const directoryFilePath of directoryFilePaths) {
          if (
            this.excludePaths.findIndex(
              (p) => join(p.directoryPath, p.subDirectoryOrFilePath) === directoryFilePath,
            ) === -1
          ) {
            const filePath = join(directoryPath, directoryFilePath);
            const remotePath = join(sourcePath.remotePath, directoryFilePath);
            const digest = await FileUtility.hash(filePath);
            manifest[remotePath] = { algorithm: 'sha1', digest, filePath };
          }
        }
      }
    }

    return manifest;
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
    const manifestFileName = `${this.bucketName}-manifest.json`;

    // Get old manifest.
    let oldManifestData: IManifest;
    try {
      const oldManifestDataBuffer = await StateManagementService.getInstance().getState(manifestFileName);
      oldManifestData = JSON.parse(oldManifestDataBuffer.toString());
    } catch (error) {
      if (error.code === 'ENOENT') {
        oldManifestData = {};
      } else {
        throw error;
      }
    }

    // Generate new manifest.
    const newManifestData: IManifest = await this.generateSourceManifest();

    // Ensure error.html and index.html exists.
    if (this.sourcePaths.length > 0 && (!newManifestData['error.html'] || !newManifestData['index.html'])) {
      throw new Error('error.html/index.html missing in root of website!');
    }

    // Generate difference in old/new manifest.
    const manifestDiff = {};
    for (const remotePath in oldManifestData) {
      if (remotePath in newManifestData) {
        if (
          oldManifestData[remotePath].algorithm !== newManifestData[remotePath].algorithm ||
          oldManifestData[remotePath].digest !== newManifestData[remotePath].digest
        ) {
          manifestDiff[remotePath] = ['update', oldManifestData[remotePath].filePath];
        }
      } else {
        manifestDiff[remotePath] = ['delete', oldManifestData[remotePath].filePath];
      }
    }
    for (const remotePath in newManifestData) {
      if (!(remotePath in oldManifestData)) {
        manifestDiff[remotePath] = ['add', newManifestData[remotePath].filePath];
      }
    }

    return [new Diff(this, DiffAction.UPDATE, 'sourcePaths', manifestDiff)];
  }

  async saveSourceManifest(): Promise<void> {
    const manifestFileName = `${this.bucketName}-manifest.json`;
    const manifestData = await this.generateSourceManifest();

    await StateManagementService.getInstance().saveState(manifestFileName, Buffer.from(JSON.stringify(manifestData)));
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
