import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

/**
 * @internal
 */
export class FileUtility {
  /**
   * Creates a directory and every missing parent of it. A directory that already exists is not an error.
   *
   * @internal
   */
  static async ensureDirectory(directoryPath: string): Promise<void> {
    await mkdir(directoryPath, { recursive: true });
  }

  /**
   * The SHA-256 of a file's bytes, base64 encoded. The file is read as a stream, so its size is not
   * bounded by memory.
   *
   * @internal
   */
  static async getSha256Digest(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    await pipeline(createReadStream(filePath), hash);
    return hash.digest('base64');
  }
}
