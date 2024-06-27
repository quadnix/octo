import { AResource, Diff, DiffAction, Resource, type UnknownOverlay } from '@quadnix/octo';
import type { IIamRoleProperties, IIamRoleResponse } from './iam-role.interface.js';

export type IamRolePolicyDiff = {
  [key: string]: { action: 'add' | 'delete'; overlay: UnknownOverlay };
};

@Resource()
export class IamRole extends AResource<IamRole> {
  readonly MODEL_NAME: string = 'iam-role';

  declare properties: IIamRoleProperties;
  declare response: IIamRoleResponse;

  private readonly policyDiff: IamRolePolicyDiff = {};

  constructor(resourceId: string, properties: IIamRoleProperties) {
    super(resourceId, properties, []);
  }

  override async diffProperties(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (this.policyDiff && Object.keys(this.policyDiff).length > 0) {
      for (const key of Object.keys(this.policyDiff)) {
        diffs.push(new Diff(this, DiffAction.UPDATE, key, this.policyDiff[key]));
      }
    }

    // Empty policyDiff.
    for (const key of Object.keys(this.policyDiff)) {
      delete this.policyDiff[key];
    }

    return diffs;
  }

  updatePolicyDiff(policyDiff: IamRolePolicyDiff): void {
    for (const key of Object.keys(policyDiff)) {
      this.policyDiff[key] = { ...policyDiff[key] };
    }
  }
}
