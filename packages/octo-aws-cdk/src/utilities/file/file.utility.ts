import { createHash } from 'crypto';
import { createReadStream } from 'fs';

export class FileUtility {
  static async hash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha1');
      const stream = createReadStream(filePath);
      stream.on('error', (error) => reject(error));
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }
}
