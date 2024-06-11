import { type AuthorizeSecurityGroupEgressCommandOutput } from '@aws-sdk/client-ec2';
import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface ISecurityGroupProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      awsRegionId: string;
      rules: {
        CidrBlock: string;
        Egress: boolean;
        FromPort: number;
        IpProtocol: string;
        ToPort: number;
      }[];
    }
  > {}

export interface ISecurityGroupResponse
  extends ModifyInterface<
    IResource['response'],
    {
      GroupId: string;
      Rules: {
        egress: AuthorizeSecurityGroupEgressCommandOutput['SecurityGroupRules'];
        ingress: AuthorizeSecurityGroupEgressCommandOutput['SecurityGroupRules'];
      };
    }
  > {}
