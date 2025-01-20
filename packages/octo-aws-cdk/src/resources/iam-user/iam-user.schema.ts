import { BaseResourceSchema, Schema } from '@quadnix/octo';

export interface IIamUserS3BucketPolicy {
  allowRead: boolean;
  allowWrite: boolean;
  bucketName: string;
  remoteDirectoryPath: string;
}

export type IIamUserPolicyTypes = {
  's3-storage-access-policy': IIamUserS3BucketPolicy;
};

export class IamUserSchema extends BaseResourceSchema {
  // Source: https://stackoverflow.com/a/56837244/1834562
  override properties = Schema<{
    awsAccountId: string;
    policies: {
      [K in keyof IIamUserPolicyTypes]-?: { policy: IIamUserPolicyTypes[K]; policyId: string; policyType: K };
    }[keyof IIamUserPolicyTypes][];
    username: string;
  }>();

  override response = Schema<{
    Arn: string;
    policies: { [key: string]: string[] };
    UserId: string;
    UserName: string;
  }>();
}
