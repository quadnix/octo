import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FileUtility } from './file.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('File Utility Test', () => {
  describe('readDirectoryRecursively()', () => {
    it('should return with file path if the input is a file', async () => {
      const result = await FileUtility.readDirectoryRecursively(join(__dirname, 'file.utility.ts'));
      expect(result).toMatchInlineSnapshot(`
        [
          "file.utility.ts",
        ]
      `);
    });

    it('should return with file path with base if the input is a file', async () => {
      const result = await FileUtility.readDirectoryRecursively(join(__dirname, 'file.utility.ts'), 'file');
      expect(result).toMatchInlineSnapshot(`
        [
          "file/file.utility.ts",
        ]
      `);
    });

    it('should return with files of a flat directory', async () => {
      const result = await FileUtility.readDirectoryRecursively(__dirname);
      expect(result).toMatchInlineSnapshot(`
        [
          "file.utility.spec.ts",
          "file.utility.ts",
        ]
      `);
    });

    it('should return with files of a deep directory', async () => {
      const result = await FileUtility.readDirectoryRecursively(join(__dirname, '..'));
      expect(result.length).toBeGreaterThan(2);
    });
  });
});
