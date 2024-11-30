import { BaseResourceSchema, Schema } from '@quadnix/octo';

export type IIamRoleAssumeRolePolicy = 'ecs-tasks.amazonaws.com';

export interface IIamRoleS3BucketPolicy {
  allowRead: boolean;
  allowWrite: boolean;
  bucketName: string;
  remoteDirectoryPath: string;
}

export type IIamRolePolicyTypes = {
  'assume-role-policy': IIamRoleAssumeRolePolicy;
  'aws-policy': string;
  's3-storage-access-policy': IIamRoleS3BucketPolicy;
};

export type IIamRolePolicy =
  | IIamRolePolicyTypes['assume-role-policy']
  | IIamRolePolicyTypes['aws-policy']
  | IIamRolePolicyTypes['s3-storage-access-policy'];

export class IamRoleSchema extends BaseResourceSchema {
  override properties = Schema<{
    policies: { policy: IIamRolePolicy; policyId: string; policyType: keyof IIamRolePolicyTypes }[];
    rolename: string;
  }>();

  override response = Schema<{
    Arn: string;
    policies: { [key: string]: string[] };
    RoleId: string;
    RoleName: string;
  }>();
}
