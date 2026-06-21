import {
  ATerraformResource,
  Diff,
  DiffAction,
  DiffUtility,
  Resource,
  ResourceError,
  type TerraformModuleScope,
} from '@quadnix/octo';
import { PolicyUtility } from '../../utilities/policy/policy.utility.js';
import {
  type IIamRoleAssumeRolePolicy,
  type IIamRolePolicyTypes,
  type IIamRoleS3BucketPolicy,
  IamRoleSchema,
} from './index.schema.js';

/**
 * @internal
 */
export type IIamRoleAddPolicyDiff = {
  action: 'add';
  policy: IIamRolePolicyTypes[keyof IIamRolePolicyTypes];
  policyId: string;
  policyType: keyof IIamRolePolicyTypes;
};
/**
 * @internal
 */
export type IIamRoleDeletePolicyDiff = { action: 'delete'; policyId: string; policyType: keyof IIamRolePolicyTypes };

/**
 * @internal
 */
@Resource<IamRole>('@octo', 'iam-role', IamRoleSchema)
export class IamRole extends ATerraformResource<IamRoleSchema, IamRole> {
  declare properties: IamRoleSchema['properties'];
  declare response: IamRoleSchema['response'];

  constructor(resourceId: string, properties: IamRoleSchema['properties']) {
    super(resourceId, properties, []);

    if (properties.policies.length === 0) {
      throw new ResourceError('At least one policy is required!', this);
    }
    if (!properties.policies.some((p) => p.policyType === 'assume-role-policy')) {
      throw new ResourceError('At least one assume-role-policy is required!', this);
    }
  }

  addAssumeRolePolicy(policyId: string, awsService: IIamRoleAssumeRolePolicy): void {
    const index = this.properties.policies.findIndex((p) => p.policyId === policyId);
    if (index === -1) {
      this.properties.policies.push({
        policy: awsService,
        policyId,
        policyType: 'assume-role-policy',
      });
    }
  }

  addAwsPolicy(policyId: string, policy: string): void {
    const index = this.properties.policies.findIndex((p) => p.policyId === policyId);
    if (index === -1) {
      this.properties.policies.push({
        policy: policy,
        policyId,
        policyType: 'aws-policy',
      });
    }
  }

  addS3BucketPolicy(
    policyId: string,
    bucketName: string,
    remoteDirectoryPath: string,
    options: { allowRead: boolean; allowWrite: boolean },
  ): void {
    const index = this.properties.policies.findIndex((p) => p.policyId === policyId);
    if (index === -1) {
      const policy: IIamRoleS3BucketPolicy = {
        allowRead: options.allowRead,
        allowWrite: options.allowWrite,
        bucketName,
        remoteDirectoryPath,
      };
      this.properties.policies.push({
        policy,
        policyId,
        policyType: 's3-storage-access-policy',
      });
    } else {
      this.properties.policies[index].policy = {
        allowRead: options.allowRead,
        allowWrite: options.allowWrite,
        bucketName,
        remoteDirectoryPath,
      };
    }
  }

  deletePolicy(policyId: string): void {
    const index = this.properties.policies.findIndex((p) => p.policyId === policyId);
    if (index > -1) {
      this.properties.policies.splice(index, 1);
    }
  }

  override async diffProperties(previous: IamRole): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties, ['policies'])) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'name is force-new on aws_iam_role; a change recreates the role',
        ),
      ];
    }

    if (this.properties.policies.length === 0) {
      return [new Diff(previous, DiffAction.DELETE, 'resourceId', previous.getContext())];
    }

    const diffs: Diff[] = [];

    for (const policy of previous.properties.policies) {
      if (!this.properties.policies.find((p) => p.policyId === policy.policyId)) {
        diffs.push(
          new Diff<any, IIamRoleDeletePolicyDiff>(this, DiffAction.UPDATE, policy.policyType, {
            action: 'delete',
            policyId: policy.policyType === 'aws-policy' ? policy.policy : policy.policyId,
            policyType: policy.policyType,
          }),
        );
      }
    }
    for (const policy of this.properties.policies) {
      if (!previous.properties.policies.find((p) => p.policyId === policy.policyId)) {
        diffs.push(
          new Diff<any, IIamRoleAddPolicyDiff>(this, DiffAction.UPDATE, policy.policyType, {
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

  override diffUnpack(diff: Diff<IamRole>): Diff[] {
    if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      const diffs: Diff[] = [diff];

      for (const policy of diff.node.properties.policies) {
        if (policy.policyType === 'assume-role-policy') {
          continue;
        }

        diffs.push(
          new Diff<any, IIamRoleAddPolicyDiff>(this, DiffAction.UPDATE, policy.policyType, {
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
        if (policy.policyType === 'assume-role-policy') {
          continue;
        }

        diffs.push(
          new Diff<any, IIamRoleDeletePolicyDiff>(this, DiffAction.UPDATE, policy.policyType, {
            action: 'delete',
            policyId: policy.policyType === 'aws-policy' ? policy.policy : policy.policyId,
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

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const assumeRolePolicies = this.properties.policies.filter((p) => p.policyType === 'assume-role-policy');
    const policyStatement = assumeRolePolicies
      .map((p) => {
        if (p.policy === 'ecs-tasks.amazonaws.com') {
          return {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: { Service: 'ecs-tasks.amazonaws.com' },
          };
        }
        return null;
      })
      .filter(Boolean);

    const iamRoleOctoResource = terraform.addOctoTerraformResource(this as IamRole, {
      provider: { accountId: this.properties.awsAccountId },
    });

    const iamRoleTFResource = iamRoleOctoResource.addTerraformResource('aws_iam_role', this.resourceId, {
      assume_role_policy: terraform.jsonencode({
        Statement: policyStatement,
        Version: '2012-10-17',
      }),
      name: this.properties.rolename,
    });
    iamRoleOctoResource.output({
      Arn: terraform.raw(`${iamRoleTFResource.address}.arn`),
      RoleId: terraform.raw(`${iamRoleTFResource.address}.unique_id`),
      RoleName: terraform.raw(`${iamRoleTFResource.address}.name`),
    });

    const awsPolicies = this.properties.policies.filter((p) => p.policyType === 'aws-policy');
    for (const policy of awsPolicies) {
      iamRoleOctoResource.addTerraformResource(
        'aws_iam_role_policy_attachment',
        `${this.resourceId}_${policy.policyId}`,
        {
          policy_arn: policy.policy as string,
          role: terraform.raw(`${iamRoleTFResource.address}.name`),
        },
      );
    }

    const s3Policies = this.properties.policies.filter((p) => p.policyType === 's3-storage-access-policy');
    for (const policy of s3Policies) {
      const s3Policy = policy.policy as IIamRoleS3BucketPolicy;
      const isRootPath = s3Policy.remoteDirectoryPath === '' || s3Policy.remoteDirectoryPath === '/';
      const bucketResources = isRootPath
        ? [`arn:aws:s3:::${s3Policy.bucketName}`, `arn:aws:s3:::${s3Policy.bucketName}/*`]
        : [
            `arn:aws:s3:::${s3Policy.bucketName}/${s3Policy.remoteDirectoryPath}`,
            `arn:aws:s3:::${s3Policy.bucketName}/${s3Policy.remoteDirectoryPath}/*`,
          ];
      const bucketWriteResources = isRootPath
        ? [`arn:aws:s3:::${s3Policy.bucketName}`, `arn:aws:s3:::${s3Policy.bucketName}/*`]
        : [`arn:aws:s3:::${s3Policy.bucketName}/${s3Policy.remoteDirectoryPath}/*`];

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
            's3:ListBucket',
          ],
          Effect: 'Allow',
          Resource: bucketResources,
          Sid: PolicyUtility.getSafeSid(`Allow read from bucket ${s3Policy.bucketName}`),
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

      const iamPolicyTFResource = iamRoleOctoResource.addTerraformResource(
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

      iamRoleOctoResource.addTerraformResource(
        'aws_iam_role_policy_attachment',
        `${this.resourceId}_${policy.policyId}_attach`,
        {
          policy_arn: terraform.raw(`${iamPolicyTFResource.address}.arn`),
          role: terraform.raw(`${iamRoleTFResource.address}.name`),
        },
      );
    }

    if (Object.keys(this.tags).length > 0) {
      iamRoleTFResource.attribute('tags', this.tags);
    }
  }
}
