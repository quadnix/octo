import { Diff, DiffAction, Service } from '@quadnix/octo';
import { lstat, readdir } from 'fs/promises';
import { join, parse, resolve } from 'path';
import { FileUtility } from '../../../../utilities/file/file.utility';
import { IS3StaticWebsiteService } from './s3-static-website.service.interface';

export type IManifest = { [key: string]: { algorithm: 'sha1'; digest: string | 'deleted'; filePath: string } };

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
    // Generate new manifest.
    const newManifestData: IManifest = {};
    for (const sourcePath of this.sourcePaths) {
      if (!sourcePath.isDirectory) {
        const filePath = join(sourcePath.directoryPath, sourcePath.subDirectoryOrFilePath);
        const digest = await FileUtility.hash(filePath);
        newManifestData[sourcePath.remotePath] = { algorithm: 'sha1', digest, filePath };
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
            newManifestData[remotePath] = { algorithm: 'sha1', digest, filePath };
          }
        }
      }
    }

    // Ensure error.html and index.html exists.
    if (this.sourcePaths.length > 0 && (!newManifestData['error.html'] || !newManifestData['index.html'])) {
      throw new Error('error.html/index.html missing in root of website!');
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
