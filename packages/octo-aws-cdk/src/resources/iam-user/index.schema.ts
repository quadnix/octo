import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * Defines the types of policies that can be attached to this IAM user.
 *
 * @group Resources/IamUser
 */
export type IIamUserPolicyTypes = {
  /**
   * You can provide options to create a policy for accessing a S3 bucket.
   */
  's3-storage-access-policy': IIamUserS3BucketPolicy;
};

/**
 * Defines the S3 storage access policy for an IAM user.
 *
 * @group Resources/IamUser
 */
export interface IIamUserS3BucketPolicy {
  /**
   * Allows read access to the bucket prefix.
   */
  allowRead: boolean;

  /**
   * Allows write access to the bucket prefix.
   */
  allowWrite: boolean;

  /**
   * The name of the bucket.
   */
  bucketName: string;

  /**
   * The path within the bucket this policy is for.
   * If you want to allow access to the entire bucket, use empty string `''`.
   */
  remoteDirectoryPath: string;
}

/**
 * The `IamUserSchema` class is the schema for the `IamUser` resource,
 * which represents the AWS Identity and Access Management (IAM) User resource.
 * This resource can create a iam user in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/).
 *
 * @group Resources/IamUser
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has no parents.
 * @overrideProperty resourceId - The resource id is of format `iam-user-<user-name>`
 */
export class IamUserSchema extends BaseResourceSchema {
  // Source: https://stackoverflow.com/a/56837244/1834562
  /**
   * Input properties.
   * * `properties.awsAccountId`: The AWS account ID.
   * * `properties.policies`: The policies to attach to the user. See {@link IIamUserPolicyTypes} for options.
   * * `properties.username`: The name of the user to create.
   */
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

  /**
   * Saved response.
   * * `response.Arn`: The ARN of the user.
   * * `response.policies`: A map of policy IDs to policy ARNs.
   * * `response.UserId`: The ID of the user.
   * * `response.UserName`: The name of the user.
   */
  @Validate({
    destruct: (value: IamUserSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.Arn) {
        subjects.push(value.Arn);
      }
      if (value.policies && Object.keys(value.policies).length > 0) {
        subjects.push(...Object.values(value.policies).flat());
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
    Arn?: string;
    policies?: { [key: string]: string[] };
    UserId?: string;
    UserName?: string;
  }>();
}
