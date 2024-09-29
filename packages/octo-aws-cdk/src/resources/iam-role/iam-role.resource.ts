import { AResource, Diff, DiffAction, Resource } from '@quadnix/octo';
import type {
  IIamRoleAssumeRolePolicy,
  IIamRolePolicy,
  IIamRoleProperties,
  IIamRoleResponse,
  IIamRoleS3BucketPolicy,
} from './iam-role.interface.js';

export type IIamRoleAddPolicyDiff = { action: 'add'; policy: IIamRolePolicy; policyId: string };
export type IIamRoleDeletePolicyDiff = { action: 'delete'; policyId: string };
export type IIamRolePolicyDiff = IIamRoleAddPolicyDiff | IIamRoleDeletePolicyDiff;

export function isAddPolicyDiff(policy: IIamRolePolicyDiff): policy is IIamRoleAddPolicyDiff {
  return policy.action === 'add';
}

export function isDeletePolicyDiff(policy: IIamRolePolicyDiff): policy is IIamRoleDeletePolicyDiff {
  return policy.action === 'delete';
}

@Resource('@octo', 'iam-role')
export class IamRole extends AResource<IamRole> {
  declare properties: IIamRoleProperties;
  declare response: IIamRoleResponse;

  constructor(resourceId: string, properties: IIamRoleProperties) {
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
      this.properties.policies.push({
        policy: {
          allowRead: options.allowRead,
          allowWrite: options.allowWrite,
          bucketName,
          remoteDirectoryPath,
        } as IIamRoleS3BucketPolicy,
        policyId,
        policyType: 's3-storage-access-policy',
      });
    } else {
      this.properties.policies[index].policy = {
        allowRead: options.allowRead,
        allowWrite: options.allowWrite,
        bucketName,
        remoteDirectoryPath,
      } as IIamRoleS3BucketPolicy;
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
      this.clonePropertiesInPlace(diff.node as IamRole);
      this.cloneResponseInPlace(diff.node as IamRole);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: IamRole): Promise<Diff[]> {
    const diffs: Diff[] = [];

    for (const policy of previous.properties.policies) {
      if (!this.properties.policies.find((p) => p.policyId === policy.policyId)) {
        diffs.push(
          new Diff(this, DiffAction.UPDATE, policy.policyType, {
            action: 'delete',
            policyId: policy.policyType === 'aws-policy' ? policy.policy : policy.policyId,
          } as IIamRoleDeletePolicyDiff),
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
          } as IIamRoleAddPolicyDiff),
        );
      }
    }

    return diffs;
  }
}
