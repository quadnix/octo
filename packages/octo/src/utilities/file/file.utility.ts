import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class FileUtility {
  static async decryptFileToBuffer(inputFilePath: string, key: string): Promise<Buffer> {
    // sha256 always produces a 32 byte key.
    const keyBuffer = createHash('sha256').update(key).digest();

    const fileHandle = await open(inputFilePath, 'r');

    try {
      const { size } = await fileHandle.stat();

      // Extract IV (first IV_LENGTH bytes) and Tag (last TAG_LENGTH bytes).
      const iv = Buffer.alloc(IV_LENGTH);
      const tag = Buffer.alloc(TAG_LENGTH);

      await fileHandle.read(iv, 0, IV_LENGTH, 0);
      await fileHandle.read(tag, 0, TAG_LENGTH, size - TAG_LENGTH);

      // Setup Decipher.
      const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
      decipher.setAuthTag(tag);

      // Create ReadStream for the encrypted chunk in the middle.
      // 'end' is inclusive, so we subtract 1 from the start of the tag.
      const readStream = createReadStream(inputFilePath, {
        autoClose: false, // The handle is closed manually in 'finally'.
        end: size - TAG_LENGTH - 1,
        fd: fileHandle.fd,
        start: IV_LENGTH,
      });

      // Decrypt and collect chunks.
      const chunks: Buffer[] = [];
      for await (const chunk of readStream.pipe(decipher)) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } finally {
      await fileHandle.close();
    }
  }

  static async encryptBufferToFile(data: Buffer, outputFilePath: string, key: string): Promise<void> {
    // sha256 always produces a 32 byte key.
    const keyBuffer = createHash('sha256').update(key).digest();
    const iv = createHash('md5').update(data).digest().subarray(0, IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);

    const readStream = Readable.from(data);
    const writeStream = createWriteStream(outputFilePath);

    // Write the IV to the start.
    writeStream.write(iv);

    // Stream the encrypted data.
    await pipeline(readStream, cipher, writeStream);

    // Append the Auth Tag to the very end.
    const tag = cipher.getAuthTag();
    const tagAppendStream = createWriteStream(outputFilePath, { flags: 'a' });

    // Final write with Tag.
    await new Promise((resolve, reject) => {
      tagAppendStream.write(tag, (error) => {
        if (error) reject(error);
        tagAppendStream.end(resolve);
      });
    });
  }
}
