import { CreateUserCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { IIamUserResponse } from '../iam-user.interface.js';
import { IamUser } from '../iam-user.resource.js';

@Action(ModelType.RESOURCE)
export class AddIamUserResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddIamUserResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model instanceof IamUser && diff.model.MODEL_NAME === 'iam-user';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamUser = diff.model as IamUser;
    const properties = iamUser.properties;
    const response = iamUser.response;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    // Create IAM user.
    const data = await iamClient.send(
      new CreateUserCommand({
        UserName: properties.username,
      }),
    );

    // Set response.
    response.Arn = data.User!.Arn!;
    response.policies = {};
    response.UserId = data.User!.UserId!;
    response.UserName = data.User!.UserName!;
  }

  async mock(capture: Partial<IIamUserResponse>): Promise<void> {
    const iamClient = await Container.get(IAMClient);
    iamClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreateUserCommand) {
        return { User: { Arn: capture.Arn, UserId: capture.UserId, UserName: capture.UserName } };
      }
    };
  }
}

@Factory<AddIamUserResourceAction>(AddIamUserResourceAction)
export class AddIamUserResourceActionFactory {
  static async create(): Promise<AddIamUserResourceAction> {
    return new AddIamUserResourceAction();
  }
}
