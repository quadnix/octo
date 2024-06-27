import { AResource, Diff, DiffAction, Resource, type UnknownOverlay } from '@quadnix/octo';
import type { IIamUserProperties, IIamUserResponse } from './iam-user.interface.js';

export type IamUserPolicyDiff = {
  [key: string]: { action: 'add' | 'delete'; overlay: UnknownOverlay };
};

@Resource()
export class IamUser extends AResource<IamUser> {
  readonly MODEL_NAME: string = 'iam-user';

  declare properties: IIamUserProperties;
  declare response: IIamUserResponse;

  private readonly policyDiff: IamUserPolicyDiff = {};

  constructor(resourceId: string, properties: IIamUserProperties) {
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

  updatePolicyDiff(policyDiff: IamUserPolicyDiff): void {
    for (const key of Object.keys(policyDiff)) {
      this.policyDiff[key] = { ...policyDiff[key] };
    }
  }
}
