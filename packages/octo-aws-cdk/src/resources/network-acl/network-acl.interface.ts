import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface INetworkAclProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      awsRegionId: string;
      entries: {
        CidrBlock: string;
        Egress: boolean;
        PortRange: { From: number; To: number };
        Protocol: string;
        RuleAction: 'allow' | 'deny';
        RuleNumber: number;
      }[];
    }
  > {}

export interface INetworkAclResponse
  extends ModifyInterface<
    IResource['response'],
    {
      associationId: string;
      defaultNetworkAclId: string;
      NetworkAclId: string;
    }
  > {}
