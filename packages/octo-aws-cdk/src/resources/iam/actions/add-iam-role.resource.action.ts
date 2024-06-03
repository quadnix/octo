import { CreateRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import type { Diff } from '@quadnix/octo';
import type { IIamRoleProperties, IIamRoleResponse } from '../iam-role.interface.js';
import type { IamRole } from '../iam-role.resource.js';

@Action(ModelType.RESOURCE)
export class AddIamRoleResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddIamRoleResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'iam-role';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamRole = diff.model as IamRole;
    const properties = iamRole.properties as unknown as IIamRoleProperties;
    const response = iamRole.response as unknown as IIamRoleResponse;

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
    response.Arn = data.Role!.Arn as string;
    response.policies = {};
    response.RoleId = data.Role!.RoleId as string;
    response.RoleName = data.Role!.RoleName as string;
  }
}

@Factory<AddIamRoleResourceAction>(AddIamRoleResourceAction)
export class AddIamRoleResourceActionFactory {
  static async create(): Promise<AddIamRoleResourceAction> {
    return new AddIamRoleResourceAction();
  }
}
