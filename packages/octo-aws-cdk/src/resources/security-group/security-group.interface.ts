import { AuthorizeSecurityGroupEgressCommandOutput } from '@aws-sdk/client-ec2';

export interface ISecurityGroupProperties {
  awsRegionId: string;
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
  Rules: {
    egress: AuthorizeSecurityGroupEgressCommandOutput['SecurityGroupRules'];
    ingress: AuthorizeSecurityGroupEgressCommandOutput['SecurityGroupRules'];
  };
}
