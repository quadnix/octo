import { DeleteRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { IamRole } from '../iam-role.resource.js';

@Action(IamRole)
export class DeleteIamRoleResourceAction implements IResourceAction {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof IamRole &&
      (diff.node.constructor as typeof IamRole).NODE_NAME === 'iam-role'
    );
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
