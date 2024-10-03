import type { IOverlay, ModifyInterface } from '@quadnix/octo';

export interface IExecutionOverlayProperties
  extends ModifyInterface<
    IOverlay['properties'],
    {
      awsRegionId: string;
      deploymentTag: string;
      environmentName: string;
      executionId: string;
      regionId: string;
      serverKey: string;
      subnetId: string;
    }
  > {}
