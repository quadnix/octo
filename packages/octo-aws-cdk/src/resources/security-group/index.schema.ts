import type { AuthorizeSecurityGroupEgressCommandOutput } from '@aws-sdk/client-ec2';
import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * Defines the schema for a security group rule.
 * These values are mapped from the official EC2 authorize security group egress/ingress document.
 * Please refer to the AWS documentation for more information.
 *
 * @group Resources/SecurityGroup
 *
 * @hideconstructor
 */
export class SecurityGroupRuleSchema {
  /**
   * The IpV4 network range to allow or deny, in CIDR notation.
   */
  @Validate({ options: { minLength: 1 } })
  CidrBlock = Schema<string>();

  /**
   * Indicates whether this is an egress rule (rule is applied to traffic leaving the security group).
   */
  @Validate({ options: { minLength: 1 } })
  Egress = Schema<boolean>();

  /**
   * The start of the port range.
   */
  @Validate({ options: { maxLength: 65535, minLength: -1 } })
  FromPort = Schema<number>();

  /**
   * The IP protocol name.
   */
  @Validate({ options: { minLength: 1 } })
  IpProtocol = Schema<string>();

  /**
   * The end of the port range.
   */
  @Validate({ options: { maxLength: 65535, minLength: -1 } })
  ToPort = Schema<number>();
}

/**
 * The `SecurityGroupSchema` class is the schema for the `SecurityGroup` resource,
 * which represents the AWS VPC Security Group resource.
 * This resource can create a security group in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ec2/).
 *
 * @group Resources/SecurityGroup
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   vpc((Vpc)) --> security_group((Security<br>Group))
 * ```
 * @overrideProperty resourceId - The resource id is of format `sec-grp-<region-id>-<security-group-name>`
 */
export class SecurityGroupSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.rules` - The security group rules. See {@link SecurityGroupRuleSchema} for options.
   */
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

  /**
   * Saved response.
   * * `response.Arn` - The security group arn.
   * * `response.GroupId` - The security group id.
   * * `response.Rules` - The security group rules. It has an `egress` and `ingress` array,
   * whose values correspond to the output from the AWS SDK V3.
   */
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
