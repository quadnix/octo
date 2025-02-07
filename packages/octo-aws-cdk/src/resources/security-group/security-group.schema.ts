import type { AuthorizeSecurityGroupEgressCommandOutput } from '@aws-sdk/client-ec2';
import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

class SecurityGroupRuleSchema {
  @Validate({ options: { minLength: 1 } })
  CidrBlock: string;

  @Validate({ options: { minLength: 1 } })
  Egress: boolean;

  @Validate({ options: { minLength: 1 } })
  FromPort: number;

  @Validate({ options: { minLength: 1 } })
  IpProtocol: string;

  @Validate({ options: { minLength: 1 } })
  ToPort: number;
}

export class SecurityGroupSchema extends BaseResourceSchema {
  @Validate<unknown>([
    {
      destruct: (value: SecurityGroupSchema['properties']): string[] => [value.awsAccountId, value.awsRegionId],
      options: { minLength: 1 },
    },
    {
      destruct: (value: SecurityGroupSchema['properties']): SecurityGroupSchema['properties']['rules'] => value.rules,
      options: { isSchema: { schema: SecurityGroupRuleSchema } },
    },
  ])
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
