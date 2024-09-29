import type { IResource, ModifyInterface } from '@quadnix/octo';

export type IIamUserPolicyTypes = {
  's3-storage-access-policy': IIamUserS3BucketPolicy;
};
export type IIamUserPolicy = IIamUserPolicyTypes['s3-storage-access-policy'];

export interface IIamUserS3BucketPolicy {
  allowRead: boolean;
  allowWrite: boolean;
  bucketName: string;
  remoteDirectoryPath: string;
}

export interface IIamUserProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      policies: { policy: IIamUserPolicy; policyId: string; policyType: keyof IIamUserPolicyTypes }[];
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
