import { TaskDefinitionUtility } from './task-definition.utility.js';

describe('TaskDefinition UT', () => {
  describe('getIncrementsOf1024()', () => {
    it('should return increments of 1024', () => {
      expect(TaskDefinitionUtility.getIncrementsOf1024(2)).toEqual([1024, 2048]);

      expect(TaskDefinitionUtility.getIncrementsOf1024(4)).toEqual([1024, 2048, 3072, 4096]);

      expect(TaskDefinitionUtility.getIncrementsOf1024(8, 2)).toEqual([2048, 3072, 4096, 5120, 6144, 7168, 8192]);

      expect(TaskDefinitionUtility.getIncrementsOf1024(16, 4)).toEqual([
        4096, 5120, 6144, 7168, 8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384,
      ]);

      expect(TaskDefinitionUtility.getIncrementsOf1024(30, 8)).toEqual([
        8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384, 17408, 18432, 19456, 20480, 21504, 22528, 23552,
        24576, 25600, 26624, 27648, 28672, 29696, 30720,
      ]);

      expect(TaskDefinitionUtility.getIncrementsOf1024(15, 4, 4)).toEqual([
        16384, 20480, 24576, 28672, 32768, 36864, 40960, 45056, 49152, 53248, 57344, 61440,
      ]);

      expect(TaskDefinitionUtility.getIncrementsOf1024(15, 4, 8)).toEqual([
        32768, 40960, 49152, 57344, 65536, 73728, 81920, 90112, 98304, 106496, 114688, 122880,
      ]);
    });
  });
});
