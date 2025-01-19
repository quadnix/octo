import { CreateRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { IamRole } from '../iam-role.resource.js';
import type { IamRoleSchema } from '../iam-role.schema.js';

@Action(IamRole)
export class AddIamRoleResourceAction implements IResourceAction<IamRole> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof IamRole &&
      (diff.node.constructor as typeof IamRole).NODE_NAME === 'iam-role' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamRole = diff.node as IamRole;
    const properties = iamRole.properties;
    const response = iamRole.response;

    // Get instances.
    const iamClient = await this.container.get(IAMClient, {
      metadata: { package: '@octo' },
    });

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

  async mock(_diff: Diff, capture: Partial<IamRoleSchema['response']>): Promise<void> {
    const iamClient = await this.container.get(IAMClient, {
      metadata: { package: '@octo' },
    });
    iamClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateRoleCommand) {
        return { Role: { Arn: capture.Arn, RoleId: capture.RoleId, RoleName: capture.RoleName } };
      }
    };
  }
}

@Factory<AddIamRoleResourceAction>(AddIamRoleResourceAction)
export class AddIamRoleResourceActionFactory {
  private static instance: AddIamRoleResourceAction;

  static async create(): Promise<AddIamRoleResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddIamRoleResourceAction(container);
    }
    return this.instance;
  }
}
