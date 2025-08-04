import { overlap } from 'fast-cidr-tools';

/**
 * @internal
 */
export class CidrUtility {
  static hasOverlap(cidrRange1: string[], cidrRange2: string[]): boolean {
    return overlap(cidrRange1, cidrRange2);
  }
}
