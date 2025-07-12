import { AResource, Diff, DiffAction, Resource } from '@quadnix/octo';
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
export type IIamRolePolicyDiff = IIamRoleAddPolicyDiff | IIamRoleDeletePolicyDiff;

/**
 * @internal
 */
export function isAddPolicyDiff(policy: IIamRolePolicyDiff): policy is IIamRoleAddPolicyDiff {
  return policy.action === 'add';
}

/**
 * @internal
 */
export function isDeletePolicyDiff(policy: IIamRolePolicyDiff): policy is IIamRoleDeletePolicyDiff {
  return policy.action === 'delete';
}

/**
 * @internal
 */
@Resource<IamRole>('@octo', 'iam-role', IamRoleSchema)
export class IamRole extends AResource<IamRoleSchema, IamRole> {
  declare properties: IamRoleSchema['properties'];
  declare response: IamRoleSchema['response'];

  constructor(resourceId: string, properties: IamRoleSchema['properties']) {
    if (properties.policies.length === 0) {
      throw new Error('At least one policy is required!');
    }

    super(resourceId, properties, []);
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

  override async diffInverse(diff: Diff, deReferenceResource: (resourceId: string) => Promise<never>): Promise<void> {
    if (diff.action === DiffAction.UPDATE) {
      if (isAddPolicyDiff((diff.value as IIamRolePolicyDiff) || {})) {
        const newPolicy = (diff.node as AResource<IamRoleSchema, IamRole>).properties.policies.find(
          (p) => p.policyId === (diff.value as IIamRoleAddPolicyDiff).policyId,
        );
        if (newPolicy && !this.properties.policies.find((p) => p.policyId === newPolicy.policyId)) {
          this.properties.policies.push(newPolicy);
        }
      } else if (isDeletePolicyDiff((diff.value as IIamRolePolicyDiff) || {})) {
        const deletedPolicyIndex = this.properties.policies.findIndex((p) => {
          if ((diff.value as IIamRoleDeletePolicyDiff).policyType === 'aws-policy') {
            return p.policy === (diff.value as IIamRoleDeletePolicyDiff).policyId;
          } else {
            return p.policyId === (diff.value as IIamRoleDeletePolicyDiff).policyId;
          }
        });
        if (deletedPolicyIndex > -1) {
          this.properties.policies.splice(deletedPolicyIndex, 1);
        }
      } else {
        this.clonePropertiesInPlace(diff.node as IamRole);
      }

      this.cloneResponseInPlace(diff.node as IamRole);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: IamRole): Promise<Diff[]> {
    if (this.properties.policies.length === 0) {
      return [new Diff(previous, DiffAction.DELETE, 'resourceId', previous.getContext())];
    }

    const diffs: Diff[] = [];

    for (const policy of previous.properties.policies) {
      if (!this.properties.policies.find((p) => p.policyId === policy.policyId)) {
        const deletePolicyDiff: IIamRoleDeletePolicyDiff = {
          action: 'delete',
          policyId: policy.policyType === 'aws-policy' ? policy.policy : policy.policyId,
          policyType: policy.policyType,
        };
        diffs.push(new Diff(this, DiffAction.UPDATE, policy.policyType, deletePolicyDiff));
      }
    }
    for (const policy of this.properties.policies) {
      if (!previous.properties.policies.find((p) => p.policyId === policy.policyId)) {
        const addPolicyDiff: IIamRoleAddPolicyDiff = {
          action: 'add',
          policy: policy.policy,
          policyId: policy.policyId,
          policyType: policy.policyType,
        };
        diffs.push(new Diff(this, DiffAction.UPDATE, policy.policyType, addPolicyDiff));
      }
    }

    return diffs;
  }

  override diffUnpack(diff: Diff): Diff[] {
    if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      const diffs: Diff[] = [diff];

      for (const policy of (diff.node as IamRole).properties.policies) {
        if (policy.policyType === 'assume-role-policy') {
          continue;
        }

        const addPolicyDiff: IIamRoleAddPolicyDiff = {
          action: 'add',
          policy: policy.policy,
          policyId: policy.policyId,
          policyType: policy.policyType,
        };
        diffs.push(new Diff(this, DiffAction.UPDATE, policy.policyType, addPolicyDiff));
      }

      return diffs;
    } else if (diff.action === DiffAction.DELETE && diff.field === 'resourceId') {
      const diffs: Diff[] = [];

      for (const policy of (diff.node as IamRole).properties.policies) {
        if (policy.policyType === 'assume-role-policy') {
          continue;
        }

        const deletePolicyDiff: IIamRoleDeletePolicyDiff = {
          action: 'delete',
          policyId: policy.policyType === 'aws-policy' ? policy.policy : policy.policyId,
          policyType: policy.policyType,
        };
        diffs.push(new Diff(this, DiffAction.UPDATE, policy.policyType, deletePolicyDiff));
      }

      diffs.push(diff);
      return diffs;
    } else {
      return [diff];
    }
  }
}
