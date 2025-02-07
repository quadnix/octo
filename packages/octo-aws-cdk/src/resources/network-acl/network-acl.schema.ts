import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class NetworkAclSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    entries: {
      CidrBlock: string;
      Egress: boolean;
      PortRange: { From: number; To: number };
      Protocol: string;
      RuleAction: 'allow' | 'deny';
      RuleNumber: number;
    }[];
  }>();

  override response = Schema<{
    associationId: string;
    defaultNetworkAclId: string;
    NetworkAclId: string;
  }>();
}
