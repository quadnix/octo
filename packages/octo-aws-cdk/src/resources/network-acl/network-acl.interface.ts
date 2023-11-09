export interface INetworkAclProperties {
  awsRegionId: string;
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
  associationId: string;
  defaultNetworkAclId: string;
  NetworkAclId: string;
}
