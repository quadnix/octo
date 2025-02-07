import type { NetworkAclEntry } from '@aws-sdk/client-ec2';

export class NetworkAclUtility {
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
