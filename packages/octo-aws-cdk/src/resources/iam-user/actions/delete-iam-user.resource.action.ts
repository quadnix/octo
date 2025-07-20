import { DeleteUserCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { IAMClientFactory } from '../../../factories/aws-client.factory.js';
import { IamUser } from '../iam-user.resource.js';

/**
 * @internal
 */
@Action(IamUser)
export class DeleteIamUserResourceAction implements IResourceAction<IamUser> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof IamUser &&
      hasNodeName(diff.node, 'iam-user') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<IamUser>): Promise<void> {
    // Get properties.
    const iamUser = diff.node;
    const properties = iamUser.properties;
    const response = iamUser.response;

    // Get instances.
    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });

    // Delete IAM user.
    await iamClient.send(
      new DeleteUserCommand({
        UserName: response.UserName,
      }),
    );
  }

  async mock(diff: Diff<IamUser>): Promise<void> {
    const iamUser = diff.node;
    const properties = iamUser.properties;

    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });
    iamClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DeleteUserCommand) {
        return;
      }
    };
  }
}

/**
 * @internal
 */
@Factory<DeleteIamUserResourceAction>(DeleteIamUserResourceAction)
export class DeleteIamUserResourceActionFactory {
  private static instance: DeleteIamUserResourceAction;

  static async create(): Promise<DeleteIamUserResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteIamUserResourceAction(container);
    }
    return this.instance;
  }
}
