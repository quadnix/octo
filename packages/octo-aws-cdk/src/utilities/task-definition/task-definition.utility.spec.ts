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

  describe('isCpuAndMemoryValid()', () => {
    it('should return true for valid CPU and memory combinations', () => {
      // Test cases for CPU = 256
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(256, 512)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(256, 1024)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(256, 2048)).toBe(true);

      // Test cases for CPU = 512
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(512, 1024)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(512, 2048)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(512, 4096)).toBe(true);

      // Test cases for CPU = 1024
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(1024, 2048)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(1024, 4096)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(1024, 8192)).toBe(true);

      // Test cases for CPU = 2048
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(2048, 4096)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(2048, 8192)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(2048, 16384)).toBe(true);

      // Test cases for CPU = 4096
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(4096, 8192)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(4096, 16384)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(4096, 30720)).toBe(true);

      // Test cases for CPU = 8192
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(8192, 16384)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(8192, 32768)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(8192, 61440)).toBe(true);

      // Test cases for CPU = 16384
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(16384, 32768)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(16384, 65536)).toBe(true);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(16384, 122880)).toBe(true);
    });

    it('should return false for invalid CPU values', () => {
      // Invalid CPU values
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(128, 512)).toBe(false);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(10240, 1024)).toBe(false);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(3072, 1024)).toBe(false);
    });

    it('should return false for invalid memory values', () => {
      // Invalid memory values for CPU = 256
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(256, 256)).toBe(false);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(256, 4096)).toBe(false);

      // Invalid memory values for CPU = 512
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(512, 512)).toBe(false);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(512, 16384)).toBe(false);

      // Invalid memory values for CPU = 1024
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(1024, 1024)).toBe(false);
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(1024, 16384)).toBe(false);
    });

    it('should return false for memory values exceeding maximum limits', () => {
      // Memory exceeding maximum for CPU = 256
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(256, 8192)).toBe(false);

      // Memory exceeding maximum for CPU = 512
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(512, 16384)).toBe(false);

      // Memory exceeding maximum for CPU = 1024
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(1024, 32768)).toBe(false);

      // Memory exceeding maximum for CPU = 2048
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(2048, 65536)).toBe(false);

      // Memory exceeding maximum for CPU = 4096
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(4096, 32768)).toBe(false);

      // Memory exceeding maximum for CPU = 8192
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(8192, 122880)).toBe(false);

      // Memory exceeding maximum for CPU = 16384
      expect(TaskDefinitionUtility.isCpuAndMemoryValid(16384, 245760)).toBe(false);
    });
  });
});
