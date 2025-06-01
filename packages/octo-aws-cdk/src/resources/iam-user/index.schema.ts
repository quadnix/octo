import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export type IIamUserPolicyTypes = {
  's3-storage-access-policy': IIamUserS3BucketPolicy;
};

export interface IIamUserS3BucketPolicy {
  allowRead: boolean;
  allowWrite: boolean;
  bucketName: string;
  remoteDirectoryPath: string;
}

export class IamUserSchema extends BaseResourceSchema {
  // Source: https://stackoverflow.com/a/56837244/1834562
  @Validate({
    destruct: (value: IamUserSchema['properties']): string[] => [value.awsAccountId, value.username],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    policies: {
      [K in keyof IIamUserPolicyTypes]-?: { policy: IIamUserPolicyTypes[K]; policyId: string; policyType: K };
    }[keyof IIamUserPolicyTypes][];
    username: string;
  }>();

  @Validate({
    destruct: (value: IamUserSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.Arn) {
        subjects.push(value.Arn);
      }
      if (value.UserId) {
        subjects.push(value.UserId);
      }
      if (value.UserName) {
        subjects.push(value.UserName);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    Arn: string;
    policies: { [key: string]: string[] };
    UserId: string;
    UserName: string;
  }>();
}
