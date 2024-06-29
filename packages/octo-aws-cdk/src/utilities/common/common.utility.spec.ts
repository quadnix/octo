import { CommonUtility } from './common.utility.js';

describe('Common Utility Test', () => {
  describe('hash()', () => {
    it('should return hash when string has value', () => {
      expect(CommonUtility.hash('test')).toBe('a94a8fe5ccb19ba61c4c0873d391e987982fbbd3');
    });
  });

  describe('randomToken()', () => {
    it('should return a string of requested size', () => {
      for (let i = 0; i < 100; i++) {
        const randomSize = Math.floor(Math.random() * 512) + 1;
        const randomString = CommonUtility.randomToken(randomSize);
        expect(randomString).toHaveLength(randomSize);
      }
    });

    it('should return an empty string when requested size is 0', () => {
      const randomString = CommonUtility.randomToken(0);
      expect(randomString).toHaveLength(0);
      expect(randomString).toBe('');
    });

    it('should return an empty string when requested size is negative', () => {
      const randomString = CommonUtility.randomToken(-1);
      expect(randomString).toHaveLength(0);
      expect(randomString).toBe('');
    });

    it('should return a string which is URL safe', () => {
      for (let i = 0; i < 100; i++) {
        const randomString = CommonUtility.randomToken(16);
        expect(randomString).toMatch(/^[A-Za-z0-9]*$/);
      }
    });
  });
});
