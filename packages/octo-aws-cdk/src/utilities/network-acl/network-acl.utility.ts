import type { NetworkAclSchema } from '../../resources/network-acl/index.schema.js';

/**
 * @internal
 */
export class NetworkAclUtility {
  private static readonly MAX_HCL_PORT = 65535;

  static assignRuleNumber(
    entries: NetworkAclSchema['properties']['entries'],
  ): NetworkAclSchema['properties']['entries'] {
    const egressEntries = entries.filter((e) => e.Egress);
    const ingressEntries = entries.filter((e) => !e.Egress);
    for (const [i, e] of egressEntries.entries()) {
      e.RuleNumber = i * 10 + 10;
    }
    for (const [i, e] of ingressEntries.entries()) {
      e.RuleNumber = i * 10 + 10;
    }

    return entries;
  }

  static isNAclEntryEqual(
    ce: Omit<NetworkAclSchema['properties']['entries'][0], 'RuleNumber'>,
    pe: Omit<NetworkAclSchema['properties']['entries'][0], 'RuleNumber'>,
  ): boolean {
    return (
      ce.CidrBlock === pe.CidrBlock &&
      ce.Egress === pe.Egress &&
      (ce.PortRange?.From || -1) === pe.PortRange?.From &&
      (ce.PortRange?.To || -1) === pe.PortRange?.To &&
      ce.Protocol === pe.Protocol &&
      ce.RuleAction === pe.RuleAction
    );
  }

  static toHclPort(value: number): number {
    const port = value === -1 ? 0 : value;
    if (!Number.isInteger(port) || port < 0 || port > NetworkAclUtility.MAX_HCL_PORT) {
      throw new Error(`Network ACL port "${value}" is out of range! Expected -1 (all ports) or 0-65535.`);
    }
    return port;
  }
}
