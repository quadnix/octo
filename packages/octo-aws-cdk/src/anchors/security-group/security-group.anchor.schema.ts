import { BaseAnchorSchema, type Execution, Schema, type Server, Validate } from '@quadnix/octo';

export class SecurityGroupAnchorRuleSchema {
  @Validate({ options: { minLength: 1 } })
  CidrBlock: string;

  @Validate({ options: { minLength: 1 } })
  Egress: boolean;

  @Validate({ options: { minLength: 1 } })
  FromPort: number;

  @Validate({ options: { minLength: 1 } })
  IpProtocol: 'tcp' | 'udp';

  @Validate({ options: { minLength: 1 } })
  ToPort: number;
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
