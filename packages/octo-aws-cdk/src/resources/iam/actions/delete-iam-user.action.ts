import { DeleteUserCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IIamUserResponse } from '../iam-user.interface.js';
import { IamUser } from '../iam-user.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteIamUserAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteIamUserAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'iam-user';
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

@Factory<DeleteIamUserAction>(DeleteIamUserAction)
export class DeleteIamUserActionFactory {
  static async create(): Promise<DeleteIamUserAction> {
    return new DeleteIamUserAction();
  }
}
