import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IEcsServiceProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      awsRegionId: string;
      desiredCount: number;
      serviceName: string;
    }
  > {}

export interface IEcsServiceResponse
  extends ModifyInterface<
    IResource['response'],
    {
      serviceArn: string;
    }
  > {}
