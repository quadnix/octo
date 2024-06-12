import type { IOverlay, ModifyInterface } from '@quadnix/octo';

export interface IS3StorageAccessOverlayProperties
  extends ModifyInterface<
    IOverlay['properties'],
    {
      allowRead: boolean;
      allowWrite: boolean;
      bucketName: string;
      remoteDirectoryPath: string;
    }
  > {}
