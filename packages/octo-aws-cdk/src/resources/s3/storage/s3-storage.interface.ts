import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IS3StorageProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      awsRegionId: string;
      Bucket: string;
    }
  > {}
