import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IIamRoleProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      rolename: string;
    }
  > {}

export interface IIamRoleResponse
  extends ModifyInterface<
    IResource['response'],
    {
      Arn: string;
      policies: { [key: string]: string[] };
      RoleId: string;
      RoleName: string;
    }
  > {}
