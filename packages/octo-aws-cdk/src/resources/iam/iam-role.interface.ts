import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IIamRoleProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      allowToAssumeRoleForServices: string[];
      attachAwsPolicies: string[];
      overlays: { overlayId: string; overlayName: string }[];
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
