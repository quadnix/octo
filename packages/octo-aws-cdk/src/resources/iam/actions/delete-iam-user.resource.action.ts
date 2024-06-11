import { DeleteUserCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { IIamUserResponse } from '../iam-user.interface.js';
import { IamUser } from '../iam-user.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteIamUserResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteIamUserResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model instanceof IamUser && diff.model.MODEL_NAME === 'iam-user';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamUser = diff.model as IamUser;
    const response = iamUser.response as unknown as IIamUserResponse;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    // Delete IAM user.
    await iamClient.send(
      new DeleteUserCommand({
        UserName: response.UserName,
      }),
    );
  }
}

@Factory<DeleteIamUserResourceAction>(DeleteIamUserResourceAction)
export class DeleteIamUserResourceActionFactory {
  static async create(): Promise<DeleteIamUserResourceAction> {
    return new DeleteIamUserResourceAction();
  }
}
