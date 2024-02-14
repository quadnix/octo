import { DeleteRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IIamRoleResponse } from '../iam-role.interface.js';
import { IamRole } from '../iam-role.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteIamRoleResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteIamRoleResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'iam-role';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamRole = diff.model as IamRole;
    const response = iamRole.response as unknown as IIamRoleResponse;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    // Delete IAM role.
    await iamClient.send(
      new DeleteRoleCommand({
        RoleName: response.RoleName,
      }),
    );
  }
}

@Factory<DeleteIamRoleResourceAction>(DeleteIamRoleResourceAction)
export class DeleteIamRoleResourceActionFactory {
  static async create(): Promise<DeleteIamRoleResourceAction> {
    return new DeleteIamRoleResourceAction();
  }
}
