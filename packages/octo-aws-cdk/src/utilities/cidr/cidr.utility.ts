import { bigint2ip, ip2bigint } from 'fast-cidr-tools';

/**
 * @internal
 */
export class CidrUtility {
  static getCidrRange(startIp: string, endIp: string): string[] {
    // IpV4 fits in 32 bits, well within Number's safe-integer range, so the bit-width math below
    // can stay in `number` while delegating the IP<->int conversion to fast-cidr-tools.
    let startIpAsNumber = Number(ip2bigint(startIp, 4));
    const endIpAsNumber = Number(ip2bigint(endIp, 4));

    const cidrBlocks: string[] = [];
    while (startIpAsNumber <= endIpAsNumber) {
      const maxBits = 32 - Math.floor(Math.log2(endIpAsNumber - startIpAsNumber + 1));
      const cidrBlock = bigint2ip(BigInt(startIpAsNumber), 4) + '/' + maxBits;
      cidrBlocks.push(cidrBlock);

      startIpAsNumber += Math.pow(2, 32 - maxBits);
    }
    return cidrBlocks;
  }

  static isPrivateIpV4CidrRange(cidrRange: string): boolean {
    const [firstIp, size = '32'] = cidrRange.split('/');

    const firstIpOctets = firstIp.split('.');
    if (firstIpOctets.length !== 4 || firstIpOctets.some((octet) => Number(octet) < 0 || Number(octet) > 255)) {
      return false;
    }

    if (firstIpOctets[0] === '10') {
      return Number(size) >= 8 && Number(size) <= 31;
    } else if (firstIpOctets[0] === '172' && Number(firstIpOctets[1]) >= 16 && Number(firstIpOctets[1]) <= 31) {
      return Number(size) >= 12 && Number(size) <= 31;
    } else if (firstIpOctets[0] === '192' && firstIpOctets[1] === '168') {
      return Number(size) >= 16 && Number(size) <= 31;
    }

    return false;
  }

  /**
   * Validates that a string is a well-formed IpV4 CIDR block usable as an AWS VPC CIDR.
   * AWS requires the network mask to be between /16 and /28 (inclusive).
   */
  static isValidVpcCidrBlock(cidrBlock: string): boolean {
    const parts = cidrBlock.split('/');
    if (parts.length !== 2) {
      return false;
    }
    const [ip, prefix] = parts;

    // IpV4: exactly four octets, each 0-255.
    const octets = ip.split('.');
    if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)) {
      return false;
    }

    // AWS VPC CIDR prefix length must be between /16 and /28.
    if (!/^\d{1,2}$/.test(prefix)) {
      return false;
    }
    const prefixLength = Number(prefix);
    return prefixLength >= 16 && prefixLength <= 28;
  }
}
