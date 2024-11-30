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

export type IIamUserPolicy = IIamUserPolicyTypes['s3-storage-access-policy'];

export class IamUserSchema extends BaseResourceSchema {
  override properties = Schema<{
    policies: { policy: IIamUserPolicy; policyId: string; policyType: keyof IIamUserPolicyTypes }[];
    username: string;
  }>();

  override response = Schema<{
    Arn: string;
    policies: { [key: string]: string[] };
    UserId: string;
    UserName: string;
  }>();
}
