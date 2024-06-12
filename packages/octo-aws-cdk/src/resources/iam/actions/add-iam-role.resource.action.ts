import { CreateRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import { IamRole } from '../iam-role.resource.js';

@Action(ModelType.RESOURCE)
export class AddIamRoleResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddIamRoleResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model instanceof IamRole && diff.model.MODEL_NAME === 'iam-role';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamRole = diff.model as IamRole;
    const properties = iamRole.properties;
    const response = iamRole.response;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    // Create IAM role.
    const data = await iamClient.send(
      new CreateRoleCommand({
        AssumeRolePolicyDocument: JSON.stringify({}),
        RoleName: properties.rolename,
      }),
    );

    // Set response.
    response.Arn = data.Role!.Arn!;
    response.policies = {};
    response.RoleId = data.Role!.RoleId!;
    response.RoleName = data.Role!.RoleName!;
  }
}

@Factory<AddIamRoleResourceAction>(AddIamRoleResourceAction)
export class AddIamRoleResourceActionFactory {
  static async create(): Promise<AddIamRoleResourceAction> {
    return new AddIamRoleResourceAction();
  }
}
