import type { IOverlay, ModifyInterface } from '@quadnix/octo';

export interface IRegionFilesystemOverlayProperties
  extends ModifyInterface<
    IOverlay['properties'],
    {
      awsRegionId: string;
      filesystemName: string;
      regionId: string;
    }
  > {}
