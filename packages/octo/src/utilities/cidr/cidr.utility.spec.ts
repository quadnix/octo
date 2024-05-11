import { CidrUtility } from './cidr.utility.js';

describe('CIDR Utility Test', () => {
  describe('isCidrValidPrivateIpV4Cidr()', () => {
    it('should return false when cidr is invalid', () => {
      expect(CidrUtility.isValidPrivateIpV4Range('100')).toBe(false);
      expect(CidrUtility.isValidPrivateIpV4Range('100.0.0.532/8')).toBe(false);
      expect(CidrUtility.isValidPrivateIpV4Range('10.0.0.32')).toBe(false);
      expect(CidrUtility.isValidPrivateIpV4Range('172.0.0.32')).toBe(false);
      expect(CidrUtility.isValidPrivateIpV4Range('172.16.0.32/8')).toBe(false);
      expect(CidrUtility.isValidPrivateIpV4Range('192.16.0.32/8')).toBe(false);
      expect(CidrUtility.isValidPrivateIpV4Range('192.168.0.32/8')).toBe(false);
    });

    it('should return true when cidr is valid', () => {
      expect(CidrUtility.isValidPrivateIpV4Range('10.0.0.76/8')).toBe(true);
      expect(CidrUtility.isValidPrivateIpV4Range('172.17.0.0/16')).toBe(true);
      expect(CidrUtility.isValidPrivateIpV4Range('192.168.0.0/20')).toBe(true);
    });
  });
});
