import { AResource, Diff, DiffAction, Resource } from '@quadnix/octo';
import type { IResource, UnknownOverlay } from '@quadnix/octo';
import type { IIamUserProperties } from './iam-user.interface.js';

export type IamUserPolicyDiff = {
  [key: string]: { action: 'add' | 'delete'; overlay: UnknownOverlay };
};

@Resource()
export class IamUser extends AResource<IamUser> {
  readonly MODEL_NAME: string = 'iam-user';

  private readonly policyDiff: IamUserPolicyDiff = {};

  constructor(resourceId: string, properties: IIamUserProperties) {
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

  updatePolicyDiff(policyDiff: IamUserPolicyDiff): void {
    for (const key of Object.keys(policyDiff)) {
      this.policyDiff[key] = { ...policyDiff[key] };
    }
  }
}
