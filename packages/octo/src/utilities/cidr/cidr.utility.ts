export class CidrUtility {
  static isValidPrivateIpV4Range(cidrRange: string): boolean {
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
