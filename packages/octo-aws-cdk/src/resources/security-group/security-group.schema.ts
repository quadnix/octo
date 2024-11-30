import type { AuthorizeSecurityGroupEgressCommandOutput } from '@aws-sdk/client-ec2';
import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class SecurityGroupSchema extends BaseResourceSchema {
  override properties = Schema<{
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
