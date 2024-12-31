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

export class IamRoleSchema extends BaseResourceSchema {
  // Source: https://stackoverflow.com/a/56837244/1834562
  override properties = Schema<{
    policies: {
      [K in keyof IIamRolePolicyTypes]-?: { policy: IIamRolePolicyTypes[K]; policyId: string; policyType: K };
    }[keyof IIamRolePolicyTypes][];
    rolename: string;
  }>();

  override response = Schema<{
    Arn: string;
    policies: { [key: string]: string[] };
    RoleId: string;
    RoleName: string;
  }>();
}
