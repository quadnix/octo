import {
  ATerraformResource,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  ResourceError,
  type TerraformModuleScope,
} from '@quadnix/octo';
import { PolicyUtility } from '../../utilities/policy/policy.utility.js';
import type { DynamoDBSchema } from '../dynamodb/index.schema.js';
import type { S3StorageSchema } from '../s3-storage/index.schema.js';
import {
  type IIamUserDynamoDBTablePolicy,
  type IIamUserPolicyTypes,
  type IIamUserS3BucketPolicy,
  IamUserSchema,
} from './index.schema.js';

/**
 * @internal
 */
export type IIamUserAddPolicyDiff = {
  action: 'add';
  policy: IIamUserPolicyTypes[keyof IIamUserPolicyTypes];
  policyId: string;
  policyType: keyof IIamUserPolicyTypes;
};
/**
 * @internal
 */
export type IIamUserDeletePolicyDiff = { action: 'delete'; policyId: string; policyType: keyof IIamUserPolicyTypes };

/**
 * @internal
 */
@Resource<IamUser>('@octo', 'iam-user', IamUserSchema, {
  uniqueProperties: [{ path: 'username', within: ['awsAccountId'] }],
})
export class IamUser extends ATerraformResource<IamUserSchema, IamUser> {
  declare properties: IamUserSchema['properties'];
  declare response: IamUserSchema['response'];

  /**
   * @internal
   */
  constructor(resourceId: string, properties: IamUserSchema['properties']) {
    super(resourceId, properties, []);
  }

  /**
   * Grants this user read or write on a table in its own account.
   *
   * The table is not a parent: IAM accepts a policy naming a table that does not exist yet. It is
   * passed in so its name and region are read off the table itself rather than handed over as
   * strings, and so a table in another account is refused.
   *
   * @internal
   */
  addDynamoDBTablePolicy(
    policyId: string,
    table: MatchingResource<DynamoDBSchema>,
    options: { allowRead: boolean; allowWrite: boolean },
  ): void {
    const { awsAccountId, awsRegionId, TableName } = table.getSchemaInstance().properties;
    if (awsAccountId !== this.properties.awsAccountId) {
      throw new ResourceError(
        `Table "${TableName}" is in account "${awsAccountId}", not in the user's account "${this.properties.awsAccountId}"!`,
        this,
      );
    }

    const policy: IIamUserDynamoDBTablePolicy = {
      allowRead: options.allowRead,
      allowWrite: options.allowWrite,
      awsRegionId,
      tableName: TableName,
    };

    const index = this.properties.policies.findIndex((p) => p.policyId === policyId);
    if (index === -1) {
      this.properties.policies.push({ policy, policyId, policyType: 'dynamodb-table-access-policy' });
    } else {
      this.properties.policies[index].policy = policy;
    }
  }

  /**
   * Grants this user read or write on a prefix of a bucket in its own account.
   *
   * The bucket is not a parent: IAM accepts a policy naming a bucket that does not exist yet. It is
   * passed in so its name is read off the bucket itself rather than handed over as a string, and so a
   * bucket in another account is refused.
   *
   * @internal
   */
  addS3BucketPolicy(
    policyId: string,
    bucket: MatchingResource<S3StorageSchema>,
    accessPrefix: string,
    options: { allowRead: boolean; allowWrite: boolean },
  ): void {
    const { awsAccountId, Bucket } = bucket.getSchemaInstance().properties;
    if (awsAccountId !== this.properties.awsAccountId) {
      throw new ResourceError(
        `Bucket "${Bucket}" is in account "${awsAccountId}", not in the user's account "${this.properties.awsAccountId}"!`,
        this,
      );
    }

    const policy: IIamUserS3BucketPolicy = {
      accessPrefix,
      allowRead: options.allowRead,
      allowWrite: options.allowWrite,
      bucketName: Bucket,
    };

    const index = this.properties.policies.findIndex((p) => p.policyId === policyId);
    if (index === -1) {
      this.properties.policies.push({ policy, policyId, policyType: 's3-storage-access-policy' });
    } else {
      this.properties.policies[index].policy = policy;
    }
  }

  /**
   * @internal
   */
  deletePolicy(policyId: string): void {
    const index = this.properties.policies.findIndex((p) => p.policyId === policyId);
    if (index > -1) {
      this.properties.policies.splice(index, 1);
    }
  }

  /**
   * @internal
   */
  override async diffProperties(previous: IamUser): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties, ['policies'])) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'name is force-new on aws_iam_user; a change recreates the user',
        ),
      ];
    }

    const diffs: Diff[] = [];

    for (const policy of previous.properties.policies) {
      if (!this.properties.policies.find((p) => p.policyId === policy.policyId)) {
        diffs.push(
          new Diff<any, IIamUserDeletePolicyDiff>(this, DiffAction.UPDATE, policy.policyType, {
            action: 'delete',
            policyId: policy.policyId,
            policyType: policy.policyType,
          }),
        );
      }
    }
    for (const policy of this.properties.policies) {
      const previousPolicy = previous.properties.policies.find((p) => p.policyId === policy.policyId);
      // A policy whose body moved under the same id is a delete and an add, because a policy is
      // one terraform resource named by that id and there is no third action to edit it with.
      if (previousPolicy && !DiffUtility.isObjectDeepEquals({ p: previousPolicy.policy }, { p: policy.policy })) {
        diffs.push(
          new Diff<any, IIamUserDeletePolicyDiff>(this, DiffAction.UPDATE, policy.policyType, {
            action: 'delete',
            policyId: policy.policyId,
            policyType: policy.policyType,
          }),
        );
      }
      if (!previousPolicy || !DiffUtility.isObjectDeepEquals({ p: previousPolicy.policy }, { p: policy.policy })) {
        diffs.push(
          new Diff<any, IIamUserAddPolicyDiff>(this, DiffAction.UPDATE, policy.policyType, {
            action: 'add',
            policy: policy.policy,
            policyId: policy.policyId,
            policyType: policy.policyType,
          }),
        );
      }
    }

    return diffs;
  }

  /**
   * @internal
   */
  override diffUnpack(diff: Diff<IamUser>): Diff[] {
    if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      const diffs: Diff[] = [diff];

      for (const policy of diff.node.properties.policies) {
        diffs.push(
          new Diff<any, IIamUserAddPolicyDiff>(this, DiffAction.UPDATE, policy.policyType, {
            action: 'add',
            policy: policy.policy,
            policyId: policy.policyId,
            policyType: policy.policyType,
          }),
        );
      }

      return diffs;
    } else if (diff.action === DiffAction.DELETE && diff.field === 'resourceId') {
      const diffs: Diff[] = [];

      for (const policy of diff.node.properties.policies) {
        diffs.push(
          new Diff<any, IIamUserDeletePolicyDiff>(this, DiffAction.UPDATE, policy.policyType, {
            action: 'delete',
            policyId: policy.policyId,
            policyType: policy.policyType,
          }),
        );
      }

      diffs.push(diff);
      return diffs;
    } else {
      return [diff];
    }
  }

  /**
   * @internal
   */
  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const iamUserOctoResource = terraform.addOctoTerraformResource(this as IamUser, {
      provider: { accountId: this.properties.awsAccountId },
    });

    const iamUserTFResource = iamUserOctoResource.addTerraformResource('aws_iam_user', this.resourceId, {
      name: this.properties.username,
    });
    iamUserOctoResource.output({
      Arn: terraform.raw(`${iamUserTFResource.address}.arn`),
      UserId: terraform.raw(`${iamUserTFResource.address}.unique_id`),
      UserName: terraform.raw(`${iamUserTFResource.address}.name`),
    });

    const dynamoDBPolicies = this.properties.policies.filter((p) => p.policyType === 'dynamodb-table-access-policy');
    for (const policy of dynamoDBPolicies) {
      const dynamoDBPolicy = policy.policy as IIamUserDynamoDBTablePolicy;
      const tableArn = [
        'arn:aws:dynamodb',
        dynamoDBPolicy.awsRegionId,
        this.properties.awsAccountId,
        `table/${dynamoDBPolicy.tableName}`,
      ].join(':');

      const policyStatements: object[] = [];
      if (dynamoDBPolicy.allowRead) {
        policyStatements.push({
          Action: [
            'dynamodb:BatchGetItem',
            'dynamodb:ConditionCheckItem',
            'dynamodb:DescribeTable',
            'dynamodb:GetItem',
            'dynamodb:Query',
            'dynamodb:Scan',
          ],
          Effect: 'Allow',
          Resource: [tableArn, `${tableArn}/index/*`],
          Sid: PolicyUtility.getSafeSid(`Allow read from table ${dynamoDBPolicy.tableName}`),
        });
      }
      if (dynamoDBPolicy.allowWrite) {
        policyStatements.push({
          Action: ['dynamodb:BatchWriteItem', 'dynamodb:DeleteItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
          Effect: 'Allow',
          Resource: [tableArn],
          Sid: PolicyUtility.getSafeSid(`Allow write to table ${dynamoDBPolicy.tableName}`),
        });
      }

      const iamPolicyTFResource = iamUserOctoResource.addTerraformResource(
        'aws_iam_policy',
        `${this.resourceId}_${policy.policyId}`,
        {
          name: policy.policyId,
          policy: terraform.jsonencode({
            Statement: policyStatements,
            Version: '2012-10-17',
          }),
        },
      );

      iamUserOctoResource.addTerraformResource(
        'aws_iam_user_policy_attachment',
        `${this.resourceId}_${policy.policyId}_attach`,
        {
          policy_arn: terraform.raw(`${iamPolicyTFResource.address}.arn`),
          user: terraform.raw(`${iamUserTFResource.address}.name`),
        },
      );
    }

    const s3Policies = this.properties.policies.filter((p) => p.policyType === 's3-storage-access-policy');
    for (const policy of s3Policies) {
      const s3Policy = policy.policy as IIamUserS3BucketPolicy;
      const isRootPath = s3Policy.accessPrefix === '' || s3Policy.accessPrefix === '/';
      const bucketReadResources = isRootPath
        ? [`arn:aws:s3:::${s3Policy.bucketName}`, `arn:aws:s3:::${s3Policy.bucketName}/*`]
        : [
            `arn:aws:s3:::${s3Policy.bucketName}/${s3Policy.accessPrefix}`,
            `arn:aws:s3:::${s3Policy.bucketName}/${s3Policy.accessPrefix}/*`,
          ];
      const bucketWriteResources = isRootPath
        ? [`arn:aws:s3:::${s3Policy.bucketName}`, `arn:aws:s3:::${s3Policy.bucketName}/*`]
        : [`arn:aws:s3:::${s3Policy.bucketName}/${s3Policy.accessPrefix}/*`];

      const policyStatements: object[] = [];
      if (s3Policy.allowRead) {
        policyStatements.push({
          Action: [
            's3:GetObject',
            's3:GetObjectAttributes',
            's3:GetObjectTagging',
            's3:GetObjectVersionAcl',
            's3:GetObjectVersionAttributes',
            's3:GetObjectVersionTagging',
          ],
          Effect: 'Allow',
          Resource: bucketReadResources,
          Sid: PolicyUtility.getSafeSid(`Allow read from bucket ${s3Policy.bucketName}`),
        });
        // s3:ListBucket is a bucket-level action, so it is only ever evaluated against the bucket
        // ARN. Granting it alongside the object actions above, whose Resource is a prefix,
        // silently grants nothing. The prefix is expressed as an s3:prefix condition instead.
        policyStatements.push({
          Action: ['s3:ListBucket'],
          Effect: 'Allow',
          Resource: [`arn:aws:s3:::${s3Policy.bucketName}`],
          Sid: PolicyUtility.getSafeSid(`Allow list from bucket ${s3Policy.bucketName}`),
          ...(isRootPath
            ? {}
            : {
                Condition: {
                  StringLike: {
                    's3:prefix': [s3Policy.accessPrefix, `${s3Policy.accessPrefix}/*`],
                  },
                },
              }),
        });
      }
      if (s3Policy.allowWrite) {
        policyStatements.push({
          Action: ['s3:PutObject', 's3:DeleteObjectVersion', 's3:DeleteObject'],
          Effect: 'Allow',
          Resource: bucketWriteResources,
          Sid: PolicyUtility.getSafeSid(`Allow write from bucket ${s3Policy.bucketName}`),
        });
      }

      const iamPolicyTFResource = iamUserOctoResource.addTerraformResource(
        'aws_iam_policy',
        `${this.resourceId}_${policy.policyId}`,
        {
          name: policy.policyId,
          policy: terraform.jsonencode({
            Statement: policyStatements,
            Version: '2012-10-17',
          }),
        },
      );

      iamUserOctoResource.addTerraformResource(
        'aws_iam_user_policy_attachment',
        `${this.resourceId}_${policy.policyId}_attach`,
        {
          policy_arn: terraform.raw(`${iamPolicyTFResource.address}.arn`),
          user: terraform.raw(`${iamUserTFResource.address}.name`),
        },
      );
    }

    if (Object.keys(this.tags).length > 0) {
      iamUserTFResource.attribute('tags', this.tags);
    }
  }
}
