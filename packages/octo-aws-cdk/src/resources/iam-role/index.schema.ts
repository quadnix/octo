import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The AWS service principal a role is assumed by. A role trusts one of these for every service that
 * runs as it, and a service missing from the list cannot use the role at all.
 * * `ecs-tasks.amazonaws.com`: an ECS task runs as the role.
 * * `lambda.amazonaws.com`: a Lambda function runs as the role.
 *
 * @group Resources/IamRole
 */
export type IIamRoleAssumeRolePolicy = 'ecs-tasks.amazonaws.com' | 'lambda.amazonaws.com';

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
   * You can provide options to create a policy for accessing a DynamoDB table.
   */
  'dynamodb-table-access-policy': IIamRoleDynamoDBTablePolicy;

  /**
   * You can provide options to create a policy for accessing a S3 bucket.
   */
  's3-storage-access-policy': IIamRoleS3BucketPolicy;
};

/**
 * Defines the DynamoDB table access policy for an IAM role.
 * Read covers the table and its indexes; write covers the table's items.
 *
 * @group Resources/IamRole
 */
export interface IIamRoleDynamoDBTablePolicy {
  /**
   * Allows reading items from the table and querying its indexes.
   */
  allowRead: boolean;

  /**
   * Allows writing and deleting items in the table.
   */
  allowWrite: boolean;

  /**
   * The AWS region the table is in. The table is in the role's own account.
   */
  awsRegionId: string;

  /**
   * The name of the table.
   */
  tableName: string;
}

/**
 * Defines the S3 storage access policy for an IAM role.
 *
 * @group Resources/IamRole
 */
export interface IIamRoleS3BucketPolicy {
  /**
   * The key prefix within the bucket this policy is for, e.g. `uploads`.
   * If you want to allow access to the entire bucket, use empty string `''`.
   */
  accessPrefix: string;

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
}

/**
 * The `IamRoleSchema` class is the schema for the `IamRole` resource,
 * which represents the AWS Identity and Access Management (IAM) Role resource.
 * Terraform provisions it as
 * [`aws_iam_role`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role).
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
   * * `response.RoleId`: The ID of the role.
   * * `response.RoleName`: The name of the role.
   */
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
    Arn?: string;
    RoleId?: string;
    RoleName?: string;
  }>({
    Arn: 'arn:aws:iam::000000000000:role/mock-role',
    RoleId: 'ABC00123456789ABC0ABC',
    RoleName: 'mock-role',
  });
}
