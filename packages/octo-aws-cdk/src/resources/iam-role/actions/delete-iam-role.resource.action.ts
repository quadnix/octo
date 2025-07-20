import { DeleteRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { IAMClientFactory } from '../../../factories/aws-client.factory.js';
import { IamRole } from '../iam-role.resource.js';

/**
 * @internal
 */
@Action(IamRole)
export class DeleteIamRoleResourceAction implements IResourceAction<IamRole> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof IamRole &&
      hasNodeName(diff.node, 'iam-role') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<IamRole>): Promise<void> {
    // Get properties.
    const iamRole = diff.node;
    const properties = iamRole.properties;
    const response = iamRole.response;

    // Get instances.
    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });

    // Delete IAM role.
    await iamClient.send(
      new DeleteRoleCommand({
        RoleName: response.RoleName,
      }),
    );
  }

  async mock(diff: Diff<IamRole>): Promise<void> {
    // Get properties.
    const iamRole = diff.node;
    const properties = iamRole.properties;

    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });
    iamClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DeleteRoleCommand) {
        return;
      }
    };
  }
}

/**
 * @internal
 */
@Factory<DeleteIamRoleResourceAction>(DeleteIamRoleResourceAction)
export class DeleteIamRoleResourceActionFactory {
  private static instance: DeleteIamRoleResourceAction;

  static async create(): Promise<DeleteIamRoleResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteIamRoleResourceAction(container);
    }
    return this.instance;
  }
}
