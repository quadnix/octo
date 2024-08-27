import { DeleteRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import { IamRole } from '../iam-role.resource.js';

@Action(NodeType.RESOURCE)
export class DeleteIamRoleResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteIamRoleResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.node instanceof IamRole && diff.node.NODE_NAME === 'iam-role';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamRole = diff.node as IamRole;
    const response = iamRole.response;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    // Delete IAM role.
    await iamClient.send(
      new DeleteRoleCommand({
        RoleName: response.RoleName,
      }),
    );
  }

  async mock(): Promise<void> {
    const iamClient = await Container.get(IAMClient);
    iamClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof DeleteRoleCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteIamRoleResourceAction>(DeleteIamRoleResourceAction)
export class DeleteIamRoleResourceActionFactory {
  static async create(): Promise<DeleteIamRoleResourceAction> {
    return new DeleteIamRoleResourceAction();
  }
}
