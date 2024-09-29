import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IEfsMountTargetProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      awsRegionId: string;
    }
  > {}

export interface IEfsMountTargetResponse
  extends ModifyInterface<
    IResource['response'],
    {
      MountTargetId: string;
      NetworkInterfaceId: string;
    }
  > {}
