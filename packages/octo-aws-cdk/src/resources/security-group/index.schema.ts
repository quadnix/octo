import type { AuthorizeSecurityGroupEgressCommandOutput } from '@aws-sdk/client-ec2';
import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

class SecurityGroupRuleSchema {
  @Validate({ options: { minLength: 1 } })
  CidrBlock = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  Egress = Schema<boolean>();

  @Validate({ options: { maxLength: 65535, minLength: -1 } })
  FromPort = Schema<number>();

  @Validate({ options: { minLength: 1 } })
  IpProtocol = Schema<string>();

  @Validate({ options: { maxLength: 65535, minLength: -1 } })
  ToPort = Schema<number>();
}

/**
 * @group Resources/SecurityGroup
 */
export class SecurityGroupSchema extends BaseResourceSchema {
  @Validate<unknown>([
    {
      destruct: (value: SecurityGroupSchema['properties']): string[] => [value.awsAccountId, value.awsRegionId],
      options: { minLength: 1 },
    },
    {
      destruct: (value: SecurityGroupSchema['properties']): SecurityGroupRuleSchema[] =>
        value.rules.length === 0 ? [] : value.rules,
      options: { isSchema: { schema: SecurityGroupRuleSchema } },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    rules: SecurityGroupRuleSchema[];
  }>();

  @Validate({
    destruct: (value: SecurityGroupSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.Arn) {
        subjects.push(value.Arn);
      }
      if (value.GroupId) {
        subjects.push(value.GroupId);
      }
      if (value.Rules && value.Rules.egress) {
        subjects.push(...value.Rules.egress.map((r) => r.SecurityGroupRuleId!).flat());
      }
      if (value.Rules && value.Rules.ingress) {
        subjects.push(...value.Rules.ingress.map((r) => r.SecurityGroupRuleId!).flat());
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    Arn?: string;
    GroupId?: string;
    Rules?: {
      egress: AuthorizeSecurityGroupEgressCommandOutput['SecurityGroupRules'];
      ingress: AuthorizeSecurityGroupEgressCommandOutput['SecurityGroupRules'];
    };
  }>();
}
