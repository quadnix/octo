import { CidrUtility } from './cidr.utility.js';

describe('CidrUtility UT', () => {
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

  describe('isValidVpcCidrBlock()', () => {
    it('should return false when the cidr is malformed', () => {
      expect(CidrUtility.isValidVpcCidrBlock('10.0.0.0')).toBe(false); // missing prefix
      expect(CidrUtility.isValidVpcCidrBlock('10.0.0.0/16/24')).toBe(false); // extra slash
      expect(CidrUtility.isValidVpcCidrBlock('not-a-cidr/16')).toBe(false);
      expect(CidrUtility.isValidVpcCidrBlock('10.0.0/16')).toBe(false); // only 3 octets
      expect(CidrUtility.isValidVpcCidrBlock('10.0.0.0.0/16')).toBe(false); // 5 octets
      expect(CidrUtility.isValidVpcCidrBlock('999.0.0.0/16')).toBe(false); // octet > 255
      expect(CidrUtility.isValidVpcCidrBlock('10.0.0.0/a')).toBe(false); // non-numeric prefix
    });

    it('should return false when the prefix is outside /16-/28', () => {
      expect(CidrUtility.isValidVpcCidrBlock('10.0.0.0/8')).toBe(false);
      expect(CidrUtility.isValidVpcCidrBlock('10.0.0.0/15')).toBe(false);
      expect(CidrUtility.isValidVpcCidrBlock('10.0.0.0/29')).toBe(false);
      expect(CidrUtility.isValidVpcCidrBlock('10.0.0.0/32')).toBe(false);
    });

    it('should return true for a valid VPC cidr block', () => {
      expect(CidrUtility.isValidVpcCidrBlock('10.0.0.0/16')).toBe(true);
      expect(CidrUtility.isValidVpcCidrBlock('10.0.0.0/28')).toBe(true);
      expect(CidrUtility.isValidVpcCidrBlock('172.16.0.0/20')).toBe(true);
      expect(CidrUtility.isValidVpcCidrBlock('192.168.0.0/24')).toBe(true);
    });
  });
});
