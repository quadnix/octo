import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IS3WebsiteProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      awsRegionId: string;
      Bucket: string;
      ErrorDocument: string;
      IndexDocument: string;
    }
  > {}

export interface IS3WebsiteResponse
  extends ModifyInterface<
    IResource['response'],
    {
      awsRegionId: string;
    }
  > {}
