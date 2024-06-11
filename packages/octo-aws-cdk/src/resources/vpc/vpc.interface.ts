import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IVpcProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      awsRegionId: string;
      CidrBlock: string;
      InstanceTenancy: 'default';
    }
  > {}

export interface IVpcResponse
  extends ModifyInterface<
    IResource['response'],
    {
      VpcId: string;
    }
  > {}
