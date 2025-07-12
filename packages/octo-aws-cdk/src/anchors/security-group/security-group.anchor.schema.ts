import { BaseAnchorSchema, type Execution, Schema, type Server, Validate } from '@quadnix/octo';

/**
 * Defines the schema for a security group rule.
 * These values are mapped from the official EC2 authorize security group egress/ingress document.
 * Please refer to the AWS documentation for more information.
 *
 * @group Anchors/SecurityGroup
 *
 * @hideconstructor
 */
export class SecurityGroupAnchorRuleSchema {
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
  @Validate({ options: { maxLength: 65535, minLength: 0 } })
  FromPort = Schema<number>();

  /**
   * The IP protocol name.
   */
  @Validate({ options: { minLength: 1 } })
  IpProtocol = Schema<'tcp' | 'udp'>();

  /**
   * The end of the port range.
   */
  @Validate({ options: { maxLength: 65535, minLength: 0 } })
  ToPort = Schema<number>();
}

/**
 * @group Anchors/SecurityGroup
 *
 * @hideconstructor
 */
export class SecurityGroupAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Execution | Server;

  /**
   * Input properties.
   * * `properties.rules` - A list of security group rules. See {@link SecurityGroupAnchorRuleSchema} for options.
   * * `properties.securityGroupName` - The name of the security group.
   */
  @Validate<unknown>([
    {
      destruct: (value: SecurityGroupAnchorSchema['properties']): SecurityGroupAnchorRuleSchema[] => value.rules,
      options: { isSchema: { schema: SecurityGroupAnchorRuleSchema } },
    },
    {
      destruct: (value: SecurityGroupAnchorSchema['properties']): string[] => [value.securityGroupName],
      options: { minLength: 1 },
    },
  ])
  override properties = Schema<{
    rules: SecurityGroupAnchorRuleSchema[];
    securityGroupName: string;
  }>();
}
