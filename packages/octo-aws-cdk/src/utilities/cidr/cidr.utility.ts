import { contains, overlap } from 'fast-cidr-tools';

/**
 * @internal
 */
export class CidrUtility {
  static contains(cidrRange1: string[], cidrRange2: string[]): boolean {
    return contains(cidrRange1, cidrRange2);
  }

  static hasOverlap(cidrRange1: string[], cidrRange2: string[]): boolean {
    return overlap(cidrRange1, cidrRange2);
  }
}
