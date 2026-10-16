import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

  describe('getSha256Digest()', () => {
    it('should return the base64 SHA-256 of the file', async () => {
      const filePath = join(tempDir, 'file.txt');
      writeFileSync(filePath, 'hello');

      expect(await FileUtility.getSha256Digest(filePath)).toBe('LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=');
    });
  });
});
