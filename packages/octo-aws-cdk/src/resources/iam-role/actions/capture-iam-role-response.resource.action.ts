import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { IamRole } from '../iam-role.resource.js';
import type { IamRoleSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(IamRole)
export class CaptureIamRoleResponseResourceAction implements IResourceAction<IamRole> {
  filter(diff: Diff): boolean {
    return diff.node instanceof IamRole && hasNodeName(diff.node, 'iam-role');
  }

  async handle(_diff: Diff<IamRole>): Promise<void> {}

  async mock(_diff: Diff<IamRole>, capture: Partial<IamRoleSchema['response']>): Promise<IamRoleSchema['response']> {
    return {
      Arn: capture.Arn,
      RoleId: capture.RoleId,
      RoleName: capture.RoleName,
    };
  }
}

@Factory<CaptureIamRoleResponseResourceAction>(CaptureIamRoleResponseResourceAction)
export class CaptureIamRoleResponseResourceActionFactory {
  private static instance: CaptureIamRoleResponseResourceAction;

  static async create(): Promise<CaptureIamRoleResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureIamRoleResponseResourceAction();
    }
    return this.instance;
  }
}
