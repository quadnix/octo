import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

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
  @Validate({
    destruct: (value: IamRoleSchema['properties']): string[] => [value.awsAccountId, value.rolename],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    policies: {
      [K in keyof IIamRolePolicyTypes]-?: { policy: IIamRolePolicyTypes[K]; policyId: string; policyType: K };
    }[keyof IIamRolePolicyTypes][];
    rolename: string;
  }>();

  @Validate({
    destruct: (value: IamRoleSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.Arn) {
        subjects.push(value.Arn);
      }
      if (value.RoleId) {
        subjects.push(value.RoleId);
      }
      if (value.RoleName) {
        subjects.push(value.RoleName);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    Arn: string;
    policies: { [key: string]: string[] };
    RoleId: string;
    RoleName: string;
  }>();
}
