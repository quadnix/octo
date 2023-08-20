export interface INetworkAclProperties {
  entries: {
    CidrBlock: string;
    Egress: boolean;
    PortRange: { From: number; To: number };
    Protocol: string;
    RuleAction: 'allow' | 'deny';
    RuleNumber: number;
  }[];
}

export interface INetworkAclResponse {
  NetworkAclId: string;
}
