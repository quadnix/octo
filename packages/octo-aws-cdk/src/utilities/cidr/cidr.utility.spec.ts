import { CidrUtility } from './cidr.utility.js';

describe('CidrUtility UT', () => {
  describe('contains()', () => {
    it('should return true if the first range contains the second', () => {
      const cidrRange1 = ['10.0.0.0/8'];
      const cidrRange2 = ['10.1.1.0/24'];
      expect(CidrUtility.contains(cidrRange1, cidrRange2)).toBe(true);
    });

    it('should return true for identical ranges', () => {
      const cidrRange1 = ['10.0.0.0/24'];
      const cidrRange2 = ['10.0.0.0/24'];
      expect(CidrUtility.contains(cidrRange1, cidrRange2)).toBe(true);
    });

    it('should return false if the first range does not contain the second', () => {
      const cidrRange1 = ['10.0.0.0/24'];
      const cidrRange2 = ['192.168.1.0/24'];
      expect(CidrUtility.contains(cidrRange1, cidrRange2)).toBe(false);
    });

    it('should return true if any of the first ranges contains any of the second', () => {
      const cidrRange1 = ['10.0.0.0/24', '192.168.1.0/24'];
      const cidrRange2 = ['192.168.1.42/32'];
      expect(CidrUtility.contains(cidrRange1, cidrRange2)).toBe(true);
    });

    it('should return false if none of the first ranges contains any of the second', () => {
      const cidrRange1 = ['10.0.0.0/24', '192.168.1.0/24'];
      const cidrRange2 = ['172.16.0.0/16'];
      expect(CidrUtility.contains(cidrRange1, cidrRange2)).toBe(false);
    });

    it('should return true for empty arrays', () => {
      expect(CidrUtility.contains([], [])).toBe(true);
    });

    it('should return false if only one array is empty', () => {
      expect(CidrUtility.contains(['10.0.0.0/24'], [])).toBe(true);
      expect(CidrUtility.contains([], ['10.0.0.0/24'])).toBe(false);
    });

    it('should return true for /32 containing itself', () => {
      expect(CidrUtility.contains(['10.0.0.1/32'], ['10.0.0.1/32'])).toBe(true);
    });

    it('should return false for /32 not containing a different /32', () => {
      expect(CidrUtility.contains(['10.0.0.1/32'], ['10.0.0.2/32'])).toBe(false);
    });

    it('should return true for large block containing smaller', () => {
      expect(CidrUtility.contains(['0.0.0.0/0'], ['192.168.1.0/24'])).toBe(true);
    });
  });

  describe('hasOverlap()', () => {
    it('should return false for non-overlapping CIDR ranges', () => {
      const cidrRange1 = ['10.0.0.0/24'];
      const cidrRange2 = ['192.168.1.0/24'];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(false);
    });

    it('should return true for overlapping CIDR ranges', () => {
      const cidrRange1 = ['10.0.0.0/16'];
      const cidrRange2 = ['10.0.1.0/24'];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(true);
    });

    it('should return true for identical CIDR ranges', () => {
      const cidrRange1 = ['10.0.0.0/24'];
      const cidrRange2 = ['10.0.0.0/24'];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(true);
    });

    it('should return true for partially overlapping CIDR ranges', () => {
      const cidrRange1 = ['10.0.0.0/25'];
      const cidrRange2 = ['10.0.0.64/26'];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(true);
    });

    it('should return false for adjacent but non-overlapping CIDR ranges', () => {
      const cidrRange1 = ['10.0.0.0/25'];
      const cidrRange2 = ['10.0.0.128/25'];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(false);
    });

    it('should return false for empty arrays', () => {
      const cidrRange1: string[] = [];
      const cidrRange2: string[] = [];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(false);
    });

    it('should return false when one array is empty', () => {
      const cidrRange1 = ['10.0.0.0/24'];
      const cidrRange2: string[] = [];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(false);
    });

    it('should return true for multiple ranges with at least one overlap', () => {
      const cidrRange1 = ['10.0.0.0/24', '192.168.1.0/24'];
      const cidrRange2 = ['172.16.0.0/16', '10.0.0.0/25'];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(true);
    });

    it('should return false for multiple ranges with no overlaps', () => {
      const cidrRange1 = ['10.0.0.0/24', '192.168.1.0/24'];
      const cidrRange2 = ['172.16.0.0/16', '203.0.113.0/24'];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(false);
    });

    it('should return true when one range completely contains another', () => {
      const cidrRange1 = ['10.0.0.0/8'];
      const cidrRange2 = ['10.1.1.0/24'];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(true);
    });

    it('should handle /32 single host ranges', () => {
      const cidrRange1 = ['10.0.0.1/32'];
      const cidrRange2 = ['10.0.0.1/32'];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(true);
    });

    it('should return false for different /32 single host ranges', () => {
      const cidrRange1 = ['10.0.0.1/32'];
      const cidrRange2 = ['10.0.0.2/32'];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(false);
    });

    it('should handle large CIDR blocks', () => {
      const cidrRange1 = ['0.0.0.0/0'];
      const cidrRange2 = ['192.168.1.0/24'];

      const result = CidrUtility.hasOverlap(cidrRange1, cidrRange2);

      expect(result).toBe(true);
    });
  });
});
