import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileUtility } from './file.utility.js';

describe('FileUtility UT', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'file-utility-'));
  });

  afterEach(() => {
    rmSync(tempDir, { force: true, recursive: true });
  });

  it('should encrypt a buffer to a file and decrypt back to the same data', async () => {
    const key = randomBytes(32);
    const data = Buffer.from('test data 123');
    const filePath = join(tempDir, 'test.enc');

    await FileUtility.encryptBufferToFile(data, filePath, key);
    const decrypted = await FileUtility.decryptFileToBuffer(filePath, key);

    expect(decrypted.equals(data)).toBe(true);
  });

  it('should fail decryption when using an incorrect key', async () => {
    const key = randomBytes(32);
    const wrongKey = randomBytes(32);
    const data = randomBytes(64);
    const filePath = join(tempDir, 'test-invalid-key.enc');

    await FileUtility.encryptBufferToFile(data, filePath, key);

    await expect(FileUtility.decryptFileToBuffer(filePath, wrongKey)).rejects.toThrow();
  });
});
