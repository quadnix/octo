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
});
