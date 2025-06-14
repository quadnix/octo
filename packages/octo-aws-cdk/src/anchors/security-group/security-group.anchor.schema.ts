import { BaseAnchorSchema, type Execution, Schema, type Server, Validate } from '@quadnix/octo';

export class SecurityGroupAnchorRuleSchema {
  @Validate({ options: { minLength: 1 } })
  CidrBlock = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  Egress = Schema<boolean>();

  @Validate({ options: { maxLength: 65535, minLength: 0 } })
  FromPort = Schema<number>();

  @Validate({ options: { minLength: 1 } })
  IpProtocol = Schema<'tcp' | 'udp'>();

  @Validate({ options: { maxLength: 65535, minLength: 0 } })
  ToPort = Schema<number>();
}

export class SecurityGroupAnchorSchema extends BaseAnchorSchema {
  parentInstance: Execution | Server;

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
