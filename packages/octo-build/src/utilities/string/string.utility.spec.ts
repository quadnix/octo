import { readdir } from 'fs/promises';
import { join } from 'path';
import { StringUtility } from './string.utility.js';

describe('StringUtility UT', () => {
  describe('AVAILABLE_MODEL_TYPES', () => {
    it('should match the actual model directories in octo package', async () => {
      // Get the actual model directories from the octo package.
      const octoModelsPath = join(process.cwd(), '..', 'octo', 'src', 'models');
      const modelDirectories = await readdir(octoModelsPath, { withFileTypes: true });

      // Filter only directories and extract their names.
      const actualModelTypes = modelDirectories
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

      const expectedModelTypes = [...StringUtility.AVAILABLE_MODEL_TYPES].sort();
      expect(actualModelTypes).toEqual(expectedModelTypes);
    });
  });

  describe('toCamelCase()', () => {
    it('should convert kebab-case to a valid camelCase identifier', () => {
      expect(StringUtility.toCamelCase('vpc')).toBe('vpc');
      expect(StringUtility.toCamelCase('my-thing')).toBe('myThing');
      expect(StringUtility.toCamelCase('my-awesome-resource')).toBe('myAwesomeResource');
    });
  });

  describe('toPascalCase()', () => {
    it('should convert kebab-case to PascalCase', () => {
      expect(StringUtility.toPascalCase('vpc')).toBe('Vpc');
      expect(StringUtility.toPascalCase('my-thing')).toBe('MyThing');
    });
  });
});
