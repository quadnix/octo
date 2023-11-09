import { CreateUserCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IIamUserProperties, IIamUserResponse } from '../iam-user.interface.js';
import { IamUser } from '../iam-user.resource.js';

@Action(ModelType.RESOURCE)
export class AddIamUserAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddIamUserAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'iam-user';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamUser = diff.model as IamUser;
    const properties = iamUser.properties as unknown as IIamUserProperties;
    const response = iamUser.response as unknown as IIamUserResponse;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    // Create IAM user.
    const data = await iamClient.send(
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

@Factory<AddIamUserAction>(AddIamUserAction)
export class AddIamUserActionFactory {
  static async create(): Promise<AddIamUserAction> {
    return new AddIamUserAction();
  }
}
