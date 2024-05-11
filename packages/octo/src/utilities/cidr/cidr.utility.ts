export class CidrUtility {
  private static ipToNumber(ipAsString: string): number {
    const octets = ipAsString.split('.').map((octet) => Number(octet));
    return (octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | (octets[3] << 0);
  }

  private static numberToIp(ipAsNumber: number): string {
    return [
      (ipAsNumber >> 24) & 0xff,
      (ipAsNumber >> 16) & 0xff,
      (ipAsNumber >> 8) & 0xff,
      (ipAsNumber >> 0) & 0xff,
    ].join('.');
  }

  static addToIp(startIp: string, capacity: number): string {
    const startIpAsNumber = CidrUtility.ipToNumber(startIp);
    return CidrUtility.numberToIp(startIpAsNumber + capacity);
  }

  static getCidrRange(startIp: string, endIp: string): string[] {
    let startIpAsNumber = CidrUtility.ipToNumber(startIp);
    const endIpAsNumber = CidrUtility.ipToNumber(endIp);

    const cidrBlocks: string[] = [];
    while (startIpAsNumber <= endIpAsNumber) {
      const maxBits = 32 - Math.floor(Math.log2(endIpAsNumber - startIpAsNumber + 1));
      const cidrBlock = CidrUtility.numberToIp(startIpAsNumber) + '/' + maxBits;
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
}
