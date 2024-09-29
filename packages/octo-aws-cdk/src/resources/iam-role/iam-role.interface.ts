import type { IResource, ModifyInterface } from '@quadnix/octo';

export type IIamRolePolicyTypes = {
  'assume-role-policy': IIamRoleAssumeRolePolicy;
  'aws-policy': string;
  's3-storage-access-policy': IIamRoleS3BucketPolicy;
};
export type IIamRolePolicy =
  | IIamRolePolicyTypes['assume-role-policy']
  | IIamRolePolicyTypes['aws-policy']
  | IIamRolePolicyTypes['s3-storage-access-policy'];

export type IIamRoleAssumeRolePolicy = 'ecs-tasks.amazonaws.com';

export interface IIamRoleS3BucketPolicy {
  allowRead: boolean;
  allowWrite: boolean;
  bucketName: string;
  remoteDirectoryPath: string;
}
export interface IIamRoleProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      policies: { policy: IIamRolePolicy; policyId: string; policyType: keyof IIamRolePolicyTypes }[];
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
