import { DeleteUserCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import { IamUser } from '../iam-user.resource.js';

@Action(NodeType.RESOURCE)
export class DeleteIamUserResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteIamUserResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.node instanceof IamUser && diff.node.NODE_NAME === 'iam-user';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamUser = diff.node as IamUser;
    const response = iamUser.response;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    // Delete IAM user.
    await iamClient.send(
      new DeleteUserCommand({
        UserName: response.UserName,
      }),
    );
  }

  async mock(): Promise<void> {
    const iamClient = await Container.get(IAMClient);
    iamClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof DeleteUserCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteIamUserResourceAction>(DeleteIamUserResourceAction)
export class DeleteIamUserResourceActionFactory {
  static async create(): Promise<DeleteIamUserResourceAction> {
    return new DeleteIamUserResourceAction();
  }
}
