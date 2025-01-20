import { type AResource, BaseResourceSchema, Schema } from '@quadnix/octo';

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

export class NetworkAclSubnetSchema extends BaseResourceSchema {
  override response = Schema<{
    SubnetId: string;
  }>();
}
export type NetworkAclSubnet = AResource<NetworkAclSubnetSchema, any>;

export class NetworkAclVpcSchema extends BaseResourceSchema {
  override response = Schema<{
    VpcId: string;
  }>();
}
export type NetworkAclVpc = AResource<NetworkAclVpcSchema, any>;
