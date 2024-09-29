import { CreateRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { IIamRoleResponse } from '../iam-role.interface.js';
import { IamRole } from '../iam-role.resource.js';

@Action(IamRole)
export class AddIamRoleResourceAction implements IResourceAction {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof IamRole &&
      (diff.node.constructor as typeof IamRole).NODE_NAME === 'iam-role'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamRole = diff.node as IamRole;
    const properties = iamRole.properties;
    const response = iamRole.response;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    // Create IAM role.
    const data = await iamClient.send(
      new CreateRoleCommand({
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: [],
          Version: '2012-10-17',
        }),
        RoleName: properties.rolename,
      }),
    );

    // Set response.
    response.Arn = data.Role!.Arn!;
    response.policies = {};
    response.RoleId = data.Role!.RoleId!;
    response.RoleName = data.Role!.RoleName!;
  }

  async mock(capture: Partial<IIamRoleResponse>): Promise<void> {
    const iamClient = await Container.get(IAMClient);
    iamClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreateRoleCommand) {
        return { Role: { Arn: capture.Arn, RoleId: capture.RoleId, RoleName: capture.RoleName } };
      }
    };
  }
}

@Factory<AddIamRoleResourceAction>(AddIamRoleResourceAction)
export class AddIamRoleResourceActionFactory {
  static async create(): Promise<AddIamRoleResourceAction> {
    return new AddIamRoleResourceAction();
  }
}
