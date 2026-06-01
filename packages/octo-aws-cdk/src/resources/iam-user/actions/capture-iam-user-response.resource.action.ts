import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { IamUser } from '../iam-user.resource.js';
import type { IamUserSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(IamUser)
export class CaptureIamUserResponseResourceAction implements IResourceAction<IamUser> {
  filter(diff: Diff): boolean {
    return diff.node instanceof IamUser && hasNodeName(diff.node, 'iam-user');
  }

  async handle(_diff: Diff<IamUser>): Promise<void> {}

  async mock(_diff: Diff<IamUser>, capture: Partial<IamUserSchema['response']>): Promise<IamUserSchema['response']> {
    return {
      Arn: capture.Arn,
      UserId: capture.UserId,
      UserName: capture.UserName,
    };
  }
}

@Factory<CaptureIamUserResponseResourceAction>(CaptureIamUserResponseResourceAction)
export class CaptureIamUserResponseResourceActionFactory {
  private static instance: CaptureIamUserResponseResourceAction;

  static async create(): Promise<CaptureIamUserResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureIamUserResponseResourceAction();
    }
    return this.instance;
  }
}
