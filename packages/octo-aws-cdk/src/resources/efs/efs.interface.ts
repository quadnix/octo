import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IEfsProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      awsRegionId: string;
      filesystemName: string;
    }
  > {}

export interface IEfsResponse
  extends ModifyInterface<
    IResource['response'],
    {
      FileSystemId: string;
      FileSystemArn: string;
    }
  > {}
