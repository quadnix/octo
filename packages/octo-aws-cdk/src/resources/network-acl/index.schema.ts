import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

class NetworkAclEntrySchema {
  @Validate({ options: { minLength: 1 } })
  CidrBlock: string;

  @Validate({ options: { minLength: 1 } })
  Egress: boolean;

  @Validate({
    destruct: (value: NetworkAclEntrySchema['PortRange']): number[] => [value.From, value.To],
    options: { minLength: 1 },
  })
  PortRange: { From: number; To: number };

  @Validate({ options: { minLength: 1 } })
  Protocol: string;

  @Validate({ options: { minLength: 1 } })
  RuleAction: 'allow' | 'deny';

  @Validate({ options: { minLength: 1 } })
  RuleNumber: number;
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
      if (value.NetworkAclId) {
        subjects.push(value.NetworkAclId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    associationId: string;
    defaultNetworkAclId: string;
    NetworkAclId: string;
  }>();
}
