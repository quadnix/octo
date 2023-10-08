import { CreateUserCommand, IAMClient } from '@aws-sdk/client-iam';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IIamUserProperties, IIamUserResponse } from '../iam-user.interface';
import { IamUser } from '../iam-user.resource';

export class AddIamUserAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddIamUserAction';

  constructor(private readonly iamClient: IAMClient) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'iam-user';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamUser = diff.model as IamUser;
    const properties = iamUser.properties as unknown as IIamUserProperties;
    const response = iamUser.response as unknown as IIamUserResponse;

    // Create IAM user.
    const data = await this.iamClient.send(
      new CreateUserCommand({
        UserName: properties.username,
      }),
    );

    // Set response.
    response.Arn = data.User!.Arn as string;
    response.UserId = data.User!.UserId as string;
    response.UserName = data.User!.UserName as string;
  }
}
