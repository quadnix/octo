import type { IOverlay, ModifyInterface } from '@quadnix/octo';

export interface ISecurityGroupOverlayProperties
  extends ModifyInterface<
    IOverlay['properties'],
    {
      awsRegionId: string;
      regionId: string;
    }
  > {}
