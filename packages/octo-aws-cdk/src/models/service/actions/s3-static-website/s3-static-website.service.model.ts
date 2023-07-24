import { lstat, readdir } from 'fs/promises';
import { join } from 'path';
import { Diff, DiffUtility, Service } from '@quadnix/octo';
import { IS3StaticWebsiteService } from './s3-static-website.service.interface';

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
    if (!subDirectoryOrFilePath) {
      subDirectoryOrFilePath = '';
    }

    // Remove leading slashes.
    subDirectoryOrFilePath = subDirectoryOrFilePath.replace(/^\/+/g, '');

    // Ensure subDirectoryOrFilePath exists, and is readable.
    const relativeSubDirectoryOrFilePath = join(directoryPath, subDirectoryOrFilePath);
    const stats = await lstat(relativeSubDirectoryOrFilePath);

    if (stats.isFile()) {
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
        filePath = join(subDirectoryOrFilePath!, filePath);

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

  override diff(previous?: S3StaticWebsiteService): Diff[] {
    // bucketName is intentionally not included in diff, since it is being used as an ID in the serviceId.
    // It cannot change within the same service.

    // excludePaths is intentionally not included in diff, since it is referenced by actions.
    // If a source gets added or updated, the excludePaths will be referenced to pickup any new changes.
    // If a source gets deleted, the excludePaths does not apply to this case.

    // Generate diff of sourcePaths.
    return DiffUtility.diffArrayOfObjects(
      previous || ({ sourcePaths: [] } as unknown as S3StaticWebsiteService),
      this,
      'sourcePaths',
      (object1, object2) => {
        return (
          object1.directoryPath === object2.directoryPath &&
          object1.isDirectory === object2.isDirectory &&
          object1.remotePath === object2.remotePath &&
          object1.subDirectoryOrFilePath === object2.subDirectoryOrFilePath
        );
      },
    );
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
