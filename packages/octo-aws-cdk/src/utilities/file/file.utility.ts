import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { lstat, readdir } from 'fs/promises';
import { join, parse, resolve } from 'path';

/**
 * @internal
 */
export class FileUtility {
  static base64Decode(base64EncodedString: string): string {
    return Buffer.from(base64EncodedString, 'base64').toString('ascii');
  }

  static async hash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha1');
      const stream = createReadStream(filePath);
      stream.on('error', (error) => reject(error));
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  static async readDirectoryRecursively(dirPath: string, base = ''): Promise<string[]> {
    dirPath = resolve(dirPath);

    const stats = await lstat(dirPath);
    if (stats.isFile()) {
      return [join(base, parse(dirPath).base)];
    }

    const dirEntries = await readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      dirEntries.map((dirEntry) => {
        const res = resolve(dirPath, dirEntry.name);
        return dirEntry.isDirectory()
          ? FileUtility.readDirectoryRecursively(res, dirEntry.name)
          : join(base, dirEntry.name);
      }),
    );
    return files.flat();
  }
}
