import { createHash } from 'crypto';
import { lstat, readdir } from 'fs/promises';
import { join, parse } from 'path';
import { ProjectUtility } from '@quadnix/octo';
import { FileUtility } from '../file/file.utility.js';

/**
 * Every file a bucket publishes, keyed by its remote path.
 *
 * @internal
 */
export type IManifest = { [key: string]: { algorithm: 'sha1'; digest: string | 'deleted'; filePath: string } };

/**
 * @internal
 */
export type IS3FileSourcePath = {
  directoryPath: string;
  isDirectory: boolean;
  remotePath: string;
  subDirectoryOrFilePath: string;
};

/**
 * @internal
 */
export type IS3FileExcludePath = { directoryPath: string; subDirectoryOrFilePath: string };

/**
 * Local files a bucket publishes: where they are read from, which are left out, and what they hash to.
 *
 * @internal
 */
export class S3FileSourceUtility {
  /**
   * Records a local directory or file to publish, and the files a filter leaves out of it.
   *
   * @internal
   */
  static async addSource(
    sourcePaths: IS3FileSourcePath[],
    excludePaths: IS3FileExcludePath[],
    directoryPath: string,
    subDirectoryOrFilePath?: string,
    filter?: (filePath: string) => boolean,
    transform?: (filePath: string) => string,
  ): Promise<void> {
    // Against the project root rather than the working directory. A module composes the graph in
    // every mode, including the `octo run-action` callback terraform makes mid-apply, and terraform
    // makes that call from a terragrunt cache directory.
    directoryPath = ProjectUtility.resolveFromProjectRoot(directoryPath);
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
        sourcePaths.push({
          directoryPath,
          isDirectory: false,
          remotePath: transform ? transform(subDirectoryOrFilePath) : subDirectoryOrFilePath,
          subDirectoryOrFilePath,
        });
      }
    } else {
      sourcePaths.push({
        directoryPath,
        isDirectory: true,
        remotePath: transform ? transform(subDirectoryOrFilePath) : subDirectoryOrFilePath,
        subDirectoryOrFilePath,
      });

      const filePaths = await readdir(relativeSubDirectoryOrFilePath, { recursive: true });
      for (let filePath of filePaths) {
        filePath = join(subDirectoryOrFilePath, filePath);

        const shouldInclude = filter ? filter(filePath) : true;
        if (!shouldInclude) {
          excludePaths.push({
            directoryPath,
            subDirectoryOrFilePath: filePath,
          });
        }
      }
    }
  }

  /**
   * A digest over a whole manifest, which changes whenever any file in it does.
   *
   * @internal
   */
  static digestManifest(manifest: IManifest): string {
    return createHash('sha1')
      .update(
        Object.keys(manifest)
          .sort()
          .map((remotePath) => `${remotePath}:${manifest[remotePath].digest}`)
          .join('\n'),
      )
      .digest('hex');
  }

  /**
   * Reads every file the sources name, and hashes it.
   *
   * @internal
   */
  static async generateManifest(
    sourcePaths: IS3FileSourcePath[],
    excludePaths: IS3FileExcludePath[],
  ): Promise<IManifest> {
    const manifest: IManifest = {};

    for (const sourcePath of sourcePaths) {
      if (!sourcePath.isDirectory) {
        const filePath = join(sourcePath.directoryPath, sourcePath.subDirectoryOrFilePath);
        const digest = await FileUtility.hash(filePath);
        manifest[sourcePath.remotePath] = { algorithm: 'sha1', digest, filePath };
      } else {
        const directoryPath = join(sourcePath.directoryPath, sourcePath.subDirectoryOrFilePath);
        const directoryFilePaths = await readdir(directoryPath, { recursive: true });
        for (const directoryFilePath of directoryFilePaths) {
          const filePath = join(directoryPath, directoryFilePath);
          const stats = await lstat(filePath);
          if (stats.isDirectory()) {
            continue;
          }

          if (excludePaths.findIndex((p) => join(p.directoryPath, p.subDirectoryOrFilePath) === filePath) === -1) {
            const remotePath = join(sourcePath.remotePath, directoryFilePath);
            const digest = await FileUtility.hash(filePath);
            manifest[remotePath] = { algorithm: 'sha1', digest, filePath };
          }
        }
      }
    }

    return manifest;
  }
}
