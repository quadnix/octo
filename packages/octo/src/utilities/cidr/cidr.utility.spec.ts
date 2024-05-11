import { CidrUtility } from './cidr.utility.js';

describe('CIDR Utility Test', () => {
  describe('addToIp()', () => {
    it('should add capacity to given ip', () => {
      expect(CidrUtility.addToIp('0.0.0.0', 1)).toBe('0.0.0.1');
      expect(CidrUtility.addToIp('10.0.0.128', 127)).toBe('10.0.0.255');
      expect(CidrUtility.addToIp('10.0.0.128', 128)).toBe('10.0.1.0');
      expect(CidrUtility.addToIp('255.255.255.255', 1)).toBe('0.0.0.0');
    });
  });

  describe('getCidrRange()', () => {
    it('should return cidr range', () => {
      expect(CidrUtility.getCidrRange('0.0.0.0', '0.0.0.0')).toEqual(['0.0.0.0/32']);
      expect(CidrUtility.getCidrRange('10.0.0.0', '10.0.0.255')).toEqual(['10.0.0.0/24']);
      expect(CidrUtility.getCidrRange('10.0.0.0', '10.0.1.255')).toEqual(['10.0.0.0/23']);
    });
  });

  describe('isPrivateIpV4CidrRange()', () => {
    it('should return false when cidr is invalid', () => {
      expect(CidrUtility.isPrivateIpV4CidrRange('100')).toBe(false);
      expect(CidrUtility.isPrivateIpV4CidrRange('100.0.0.532/8')).toBe(false);
      expect(CidrUtility.isPrivateIpV4CidrRange('10.0.0.32')).toBe(false);
      expect(CidrUtility.isPrivateIpV4CidrRange('172.0.0.32')).toBe(false);
      expect(CidrUtility.isPrivateIpV4CidrRange('172.16.0.32/8')).toBe(false);
      expect(CidrUtility.isPrivateIpV4CidrRange('192.16.0.32/8')).toBe(false);
      expect(CidrUtility.isPrivateIpV4CidrRange('192.168.0.32/8')).toBe(false);
    });

    it('should return true when cidr is valid', () => {
      expect(CidrUtility.isPrivateIpV4CidrRange('10.0.0.76/8')).toBe(true);
      expect(CidrUtility.isPrivateIpV4CidrRange('172.17.0.0/16')).toBe(true);
      expect(CidrUtility.isPrivateIpV4CidrRange('192.168.0.0/20')).toBe(true);
    });
  });
});
