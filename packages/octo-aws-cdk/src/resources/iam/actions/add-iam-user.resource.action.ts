import { CreateUserCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import type { Diff } from '@quadnix/octo';
import type { IIamUserProperties, IIamUserResponse } from '../iam-user.interface.js';
import type { IamUser } from '../iam-user.resource.js';

@Action(ModelType.RESOURCE)
export class AddIamUserResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddIamUserResourceAction';

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
    response.policies = {};
    response.UserId = data.User!.UserId as string;
    response.UserName = data.User!.UserName as string;
  }
}

@Factory<AddIamUserResourceAction>(AddIamUserResourceAction)
export class AddIamUserResourceActionFactory {
  static async create(): Promise<AddIamUserResourceAction> {
    return new AddIamUserResourceAction();
  }
}
