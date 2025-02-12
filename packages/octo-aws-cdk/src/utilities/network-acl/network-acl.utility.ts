import type { NetworkAclEntry } from '@aws-sdk/client-ec2';
import type { NetworkAclSchema } from '../../resources/network-acl/network-acl.schema.js';

export class NetworkAclUtility {
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

  static isNAclEntryEqual(ce: NetworkAclEntry, pe: NetworkAclEntry): boolean {
    return (
      ce.CidrBlock === pe.CidrBlock &&
      ce.Egress === pe.Egress &&
      (ce.PortRange?.From || -1) === pe.PortRange?.From &&
      (ce.PortRange?.To || -1) === pe.PortRange?.To &&
      ce.Protocol === pe.Protocol &&
      ce.RuleAction === pe.RuleAction
    );
  }
}
