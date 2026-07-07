import { StringUtility } from './string.utility.js';

describe('StringUtility UT', () => {
  describe('deterministicHash()', () => {
    it('should return a 16-character hex string', () => {
      const hash = StringUtility.deterministicHash('hello');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should return the same hash for the same primitive value', () => {
      expect(StringUtility.deterministicHash('hello')).toBe(StringUtility.deterministicHash('hello'));
    });

    it('should return different hashes for different primitive values', () => {
      expect(StringUtility.deterministicHash('hello')).not.toBe(StringUtility.deterministicHash('world'));
    });

    it('should return the same hash for objects regardless of key insertion order', () => {
      const a = { a: 2, z: 1 };
      const b = { a: 2, z: 1 };
      expect(StringUtility.deterministicHash(a)).toBe(StringUtility.deterministicHash(b));
    });

    it('should return different hashes for objects with different values', () => {
      expect(StringUtility.deterministicHash({ a: 1 })).not.toBe(StringUtility.deterministicHash({ a: 2 }));
    });

    it('should handle null', () => {
      expect(StringUtility.deterministicHash(null)).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should handle arrays', () => {
      expect(StringUtility.deterministicHash([1, 2, 3])).toBe(StringUtility.deterministicHash([1, 2, 3]));
    });

    it('should treat arrays with different order as different', () => {
      expect(StringUtility.deterministicHash([1, 2, 3])).not.toBe(StringUtility.deterministicHash([3, 2, 1]));
    });

    it('should handle nested objects with any key insertion order', () => {
      const a = { outer: { a: 2, z: 1 } };
      const b = { outer: { a: 2, z: 1 } };
      expect(StringUtility.deterministicHash(a)).toBe(StringUtility.deterministicHash(b));
    });
  });

  describe('sanitizeForIdentifier()', () => {
    it('should leave alphanumeric characters unchanged', () => {
      expect(StringUtility.sanitizeForIdentifier('abc123')).toBe('abc123');
    });

    it('should leave underscores unchanged', () => {
      expect(StringUtility.sanitizeForIdentifier('a_b')).toBe('a_b');
    });

    it('should leave dashes unchanged', () => {
      expect(StringUtility.sanitizeForIdentifier('a-b')).toBe('a-b');
    });

    it('should replace dots with underscores', () => {
      expect(StringUtility.sanitizeForIdentifier('a.b')).toBe('a_b');
    });

    it('should replace slashes with underscores', () => {
      expect(StringUtility.sanitizeForIdentifier('a/b')).toBe('a_b');
    });

    it('should replace spaces with underscores', () => {
      expect(StringUtility.sanitizeForIdentifier('a b')).toBe('a_b');
    });

    it('should replace every disallowed character in a mixed string', () => {
      expect(StringUtility.sanitizeForIdentifier('us-east-1/vpc.main')).toBe('us-east-1_vpc_main');
    });
  });

  describe('sanitizeForEnvironmentVariable()', () => {
    it('should leave alphanumeric characters unchanged', () => {
      expect(StringUtility.sanitizeForEnvironmentVariable('abc123')).toBe('abc123');
    });

    it('should leave underscores unchanged', () => {
      expect(StringUtility.sanitizeForEnvironmentVariable('a_b')).toBe('a_b');
    });

    it('should replace dashes with underscores', () => {
      expect(StringUtility.sanitizeForEnvironmentVariable('a-b')).toBe('a_b');
    });

    it('should replace dots with underscores', () => {
      expect(StringUtility.sanitizeForEnvironmentVariable('a.b')).toBe('a_b');
    });

    it('should replace slashes with underscores', () => {
      expect(StringUtility.sanitizeForEnvironmentVariable('a/b')).toBe('a_b');
    });

    it('should replace every disallowed character in a mixed string', () => {
      expect(StringUtility.sanitizeForEnvironmentVariable('us-east-1/vpc.main')).toBe('us_east_1_vpc_main');
    });
  });
});
