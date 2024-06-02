import { AResource, Diff, DiffAction, IResource, Resource, UnknownOverlay } from '@quadnix/octo';
import { IIamRoleProperties } from './iam-role.interface.js';

export type IamRolePolicyDiff = {
  [key: string]: { action: 'add' | 'delete'; overlay: UnknownOverlay };
};

@Resource()
export class IamRole extends AResource<IamRole> {
  readonly MODEL_NAME: string = 'iam-role';

  private readonly policyDiff: IamRolePolicyDiff = {};

  constructor(resourceId: string, properties: IIamRoleProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }

  override async diff(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (this.policyDiff && Object.keys(this.policyDiff).length > 0) {
      for (const key of Object.keys(this.policyDiff)) {
        diffs.push(new Diff(this, DiffAction.UPDATE, key, this.policyDiff[key]));
      }
    }

    return diffs;
  }

  updatePolicyDiff(policyDiff: IamRolePolicyDiff): void {
    for (const key of Object.keys(policyDiff)) {
      this.policyDiff[key] = { ...policyDiff[key] };
    }
  }
}
