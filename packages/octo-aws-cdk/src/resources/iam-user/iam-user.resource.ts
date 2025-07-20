import { AResource, Diff, DiffAction, Resource } from '@quadnix/octo';
import { type IIamUserPolicyTypes, type IIamUserS3BucketPolicy, IamUserSchema } from './index.schema.js';

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
export type IIamUserPolicyDiff = IIamUserAddPolicyDiff | IIamUserDeletePolicyDiff;

/**
 * @internal
 */
export function isAddPolicyDiff(policy: IIamUserPolicyDiff): policy is IIamUserAddPolicyDiff {
  return policy.action === 'add';
}

/**
 * @internal
 */
export function isDeletePolicyDiff(policy: IIamUserPolicyDiff): policy is IIamUserDeletePolicyDiff {
  return policy.action === 'delete';
}

/**
 * @internal
 */
@Resource<IamUser>('@octo', 'iam-user', IamUserSchema)
export class IamUser extends AResource<IamUserSchema, IamUser> {
  declare properties: IamUserSchema['properties'];
  declare response: IamUserSchema['response'];

  constructor(resourceId: string, properties: IamUserSchema['properties']) {
    super(resourceId, properties, []);
  }

  addS3BucketPolicy(
    policyId: string,
    bucketName: string,
    remoteDirectoryPath: string,
    options: { allowRead: boolean; allowWrite: boolean },
  ): void {
    const index = this.properties.policies.findIndex((p) => p.policyId === policyId);
    if (index === -1) {
      const policy: IIamUserS3BucketPolicy = {
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

  override async diffInverse(
    diff: Diff<IamUser, IIamUserPolicyDiff>,
    deReferenceResource: (resourceId: string) => Promise<never>,
  ): Promise<void> {
    if (diff.action === DiffAction.UPDATE) {
      if (isAddPolicyDiff(diff.value || {})) {
        const newPolicy = diff.node.properties.policies.find((p) => p.policyId === diff.value.policyId);
        if (newPolicy) {
          this.properties.policies.push(newPolicy);
        }
      } else if (isDeletePolicyDiff(diff.value || {})) {
        const deletedPolicyIndex = this.properties.policies.findIndex((p) => p.policyId === diff.value.policyId);
        if (deletedPolicyIndex > -1) {
          this.properties.policies.splice(deletedPolicyIndex, 1);
        }
      } else {
        this.clonePropertiesInPlace(diff.node);
      }

      this.cloneResponseInPlace(diff.node);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: IamUser): Promise<Diff[]> {
    const diffs: Diff[] = [];

    for (const policy of previous.properties.policies) {
      if (!this.properties.policies.find((p) => p.policyId === policy.policyId)) {
        const deletePolicyDiff: IIamUserDeletePolicyDiff = {
          action: 'delete',
          policyId: policy.policyId,
          policyType: policy.policyType,
        };
        diffs.push(new Diff(this, DiffAction.UPDATE, policy.policyType, deletePolicyDiff));
      }
    }
    for (const policy of this.properties.policies) {
      if (!previous.properties.policies.find((p) => p.policyId === policy.policyId)) {
        const addPolicyDiff: IIamUserAddPolicyDiff = {
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

  override diffUnpack(diff: Diff<IamUser>): Diff[] {
    if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      const diffs: Diff[] = [diff];

      for (const policy of diff.node.properties.policies) {
        const addPolicyDiff: IIamUserAddPolicyDiff = {
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

      for (const policy of diff.node.properties.policies) {
        const updatePolicyDiff: IIamUserDeletePolicyDiff = {
          action: 'delete',
          policyId: policy.policyId,
          policyType: policy.policyType,
        };
        diffs.push(new Diff(this, DiffAction.UPDATE, policy.policyType, updatePolicyDiff));
      }

      diffs.push(diff);
      return diffs;
    } else {
      return [diff];
    }
  }
}
