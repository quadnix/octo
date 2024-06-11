import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IEcsClusterProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      awsRegionId: string;
      clusterName: string;
      regionId: string;
    }
  > {}

export interface IEcsClusterResponse
  extends ModifyInterface<
    IResource['response'],
    {
      clusterArn: string;
    }
  > {}
