export interface ISecurityGroupProperties {
  rules: {
    CidrBlock: string;
    Egress: boolean;
    FromPort: number;
    IpProtocol: string;
    ToPort: number;
  }[];
}

export interface ISecurityGroupResponse {
  GroupId: string;
}
