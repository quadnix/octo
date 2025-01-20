import type { AuthorizeSecurityGroupEgressCommandOutput } from '@aws-sdk/client-ec2';
import { type AResource, BaseResourceSchema, Schema } from '@quadnix/octo';

export class SecurityGroupSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    rules: {
      CidrBlock: string;
      Egress: boolean;
      FromPort: number;
      IpProtocol: string;
      ToPort: number;
    }[];
  }>();

  override response = Schema<{
    GroupId: string;
    Rules: {
      egress: AuthorizeSecurityGroupEgressCommandOutput['SecurityGroupRules'];
      ingress: AuthorizeSecurityGroupEgressCommandOutput['SecurityGroupRules'];
    };
  }>();
}

export class SecurityGroupVpcSchema extends BaseResourceSchema {
  override response = Schema<{
    VpcId: string;
  }>();
}
export type SecurityGroupVpc = AResource<SecurityGroupVpcSchema, any>;
