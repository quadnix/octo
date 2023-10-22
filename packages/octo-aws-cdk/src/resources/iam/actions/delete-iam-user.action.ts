import { DeleteUserCommand, IAMClient } from '@aws-sdk/client-iam';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IIamUserResponse } from '../iam-user.interface.js';
import { IamUser } from '../iam-user.resource.js';

export class DeleteIamUserAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteIamUserAction';

  constructor(private readonly iamClient: IAMClient) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'iam-user';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamUser = diff.model as IamUser;
    const response = iamUser.response as unknown as IIamUserResponse;

    // Delete IAM user.
    await this.iamClient.send(
      new DeleteUserCommand({
        UserName: response.UserName,
      }),
    );
  }
}
