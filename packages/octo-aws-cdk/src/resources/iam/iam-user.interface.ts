import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IIamUserProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      username: string;
    }
  > {}

export interface IIamUserResponse
  extends ModifyInterface<
    IResource['response'],
    {
      Arn: string;
      policies: { [key: string]: string[] };
      UserId: string;
      UserName: string;
    }
  > {}
