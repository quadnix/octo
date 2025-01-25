import { AResource, Diff, DiffAction, Resource } from '@quadnix/octo';
import { type IIamUserPolicyTypes, type IIamUserS3BucketPolicy, IamUserSchema } from './iam-user.schema.js';

export type IIamUserAddPolicyDiff = {
  action: 'add';
  policy: IIamUserPolicyTypes[keyof IIamUserPolicyTypes];
  policyId: string;
};
export type IIamUserDeletePolicyDiff = { action: 'delete'; policyId: string };
export type IIamUserPolicyDiff = IIamUserAddPolicyDiff | IIamUserDeletePolicyDiff;

export function isAddPolicyDiff(policy: IIamUserPolicyDiff): policy is IIamUserAddPolicyDiff {
  return policy.action === 'add';
}

export function isDeletePolicyDiff(policy: IIamUserPolicyDiff): policy is IIamUserDeletePolicyDiff {
  return policy.action === 'delete';
}

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
      this.properties.policies.push({
        policy: {
          allowRead: options.allowRead,
          allowWrite: options.allowWrite,
          bucketName,
          remoteDirectoryPath,
        } as IIamUserS3BucketPolicy,
        policyId,
        policyType: 's3-storage-access-policy',
      });
    } else {
      this.properties.policies[index].policy = {
        allowRead: options.allowRead,
        allowWrite: options.allowWrite,
        bucketName,
        remoteDirectoryPath,
      } as IIamUserS3BucketPolicy;
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
      this.clonePropertiesInPlace(diff.node as IamUser);
      this.cloneResponseInPlace(diff.node as IamUser);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: IamUser): Promise<Diff[]> {
    const diffs: Diff[] = [];

    for (const policy of previous.properties.policies) {
      if (!this.properties.policies.find((p) => p.policyId === policy.policyId)) {
        diffs.push(
          new Diff(this, DiffAction.UPDATE, policy.policyType, {
            action: 'delete',
            policyId: policy.policyId,
          } as IIamUserDeletePolicyDiff),
        );
      }
    }
    for (const policy of this.properties.policies) {
      if (!previous.properties.policies.find((p) => p.policyId === policy.policyId)) {
        diffs.push(
          new Diff(this, DiffAction.UPDATE, policy.policyType, {
            action: 'add',
            policy: policy.policy,
            policyId: policy.policyId,
          } as IIamUserAddPolicyDiff),
        );
      }
    }

    return diffs;
  }

  override diffUnpack(diff: Diff): Diff[] {
    if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      const diffs: Diff[] = [diff];

      for (const policy of (diff.node as IamUser).properties.policies) {
        diffs.push(
          new Diff(this, DiffAction.UPDATE, policy.policyType, {
            action: 'add',
            policy: policy.policy,
            policyId: policy.policyId,
          } as IIamUserAddPolicyDiff),
        );
      }

      return diffs;
    } else if (diff.action === DiffAction.DELETE && diff.field === 'resourceId') {
      const diffs: Diff[] = [];

      for (const policy of (diff.node as IamUser).properties.policies) {
        diffs.push(
          new Diff(this, DiffAction.UPDATE, policy.policyType, {
            action: 'delete',
            policyId: policy.policyId,
          } as IIamUserDeletePolicyDiff),
        );
      }

      diffs.push(diff);
      return diffs;
    } else {
      return [diff];
    }
  }
}
