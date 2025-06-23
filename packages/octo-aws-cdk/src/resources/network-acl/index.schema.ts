import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

class NetworkAclEntrySchema {
  @Validate({ options: { minLength: 1 } })
  CidrBlock = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  Egress = Schema<boolean>();

  @Validate({
    destruct: (value: NetworkAclEntrySchema['PortRange']): number[] => [value.From, value.To],
    options: { maxLength: 65535, minLength: -1 },
  })
  PortRange = Schema<{ From: number; To: number }>();

  @Validate({ options: { minLength: 1 } })
  Protocol = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  RuleAction = Schema<'allow' | 'deny'>();

  @Validate({ options: { minLength: 1 } })
  RuleNumber = Schema<number>();
}

export class NetworkAclSchema extends BaseResourceSchema {
  @Validate<unknown>([
    {
      destruct: (value: NetworkAclSchema['properties']): string[] => [value.awsAccountId, value.awsRegionId],
      options: { minLength: 1 },
    },
    {
      destruct: (value: NetworkAclSchema['properties']): NetworkAclEntrySchema[] => value.entries,
      options: { isSchema: { schema: NetworkAclEntrySchema } },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    entries: NetworkAclEntrySchema[];
  }>();

  @Validate({
    destruct: (value: NetworkAclSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.associationId) {
        subjects.push(value.associationId);
      }
      if (value.defaultNetworkAclId) {
        subjects.push(value.defaultNetworkAclId);
      }
      if (value.NetworkAclArn) {
        subjects.push(value.NetworkAclArn);
      }
      if (value.NetworkAclId) {
        subjects.push(value.NetworkAclId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    associationId?: string;
    defaultNetworkAclId?: string;
    NetworkAclArn?: string;
    NetworkAclId?: string;
  }>();
}
