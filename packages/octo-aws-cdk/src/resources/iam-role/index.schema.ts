import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * List of IAM entities regarding roles, policies, and permissions.
 * Possible values are,
 * * `ecs-tasks.amazonaws.com`: This is an AWS service principal for ECS tasks.
 * It is used in IAM trust policies to allow ECS tasks to assume a role.
 * You must add this to the set of policies if you are running ECS tasks in your cluster.
 *
 * @group Resources/IamRole
 */
export type IIamRoleAssumeRolePolicy = 'ecs-tasks.amazonaws.com';

/**
 * Defines the types of policies that can be attached to this IAM role.
 *
 * @group Resources/IamRole
 */
export type IIamRolePolicyTypes = {
  /**
   * You can provide a policy that allows the role to assume another role, or establish trust relationships.
   * See {@link IIamRoleAssumeRolePolicy} for options.
   */
  'assume-role-policy': IIamRoleAssumeRolePolicy;

  /**
   * You can provide a policy that allows the role to perform actions on AWS resources.
   * This can be a predefined AWS managed policy ARN or custom policy ARN that you create.
   */
  'aws-policy': string;

  /**
   * You can provide options to create a policy for accessing a S3 bucket.
   */
  's3-storage-access-policy': IIamRoleS3BucketPolicy;
};

/**
 * Defines the S3 storage access policy for an IAM role.
 *
 * @group Resources/IamRole
 */
export interface IIamRoleS3BucketPolicy {
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
 * The `IamRoleSchema` class is the schema for the `IamRole` resource,
 * which represents the AWS Identity and Access Management (IAM) Role resource.
 * This resource can create a iam role in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/).
 *
 * @group Resources/IamRole
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has no parents.
 * @overrideProperty resourceId - The resource id is of format `iam-role-<role-name>`
 */
export class IamRoleSchema extends BaseResourceSchema {
  // Source: https://stackoverflow.com/a/56837244/1834562
  /**
   * Input properties.
   * * `properties.awsAccountId`: The AWS account ID.
   * * `properties.policies`: The policies to attach to the role. See {@link IIamRolePolicyTypes} for options.
   * * `properties.rolename`: The name of the role to create.
   */
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

  /**
   * Saved response.
   * * `response.Arn`: The ARN of the role.
   * * `response.policies`: A map of policy IDs to policy ARNs.
   * * `response.RoleId`: The ID of the role.
   * * `response.RoleName`: The name of the role.
   */
  @Validate({
    destruct: (value: IamRoleSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.Arn) {
        subjects.push(value.Arn);
      }
      if (value.policies && Object.keys(value.policies).length > 0) {
        subjects.push(...Object.values(value.policies).flat());
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
    Arn?: string;
    policies?: { [key: string]: string[] };
    RoleId?: string;
    RoleName?: string;
  }>();
}
