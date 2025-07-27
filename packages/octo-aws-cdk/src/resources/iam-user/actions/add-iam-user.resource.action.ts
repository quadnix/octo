import { CreateUserCommand, GetUserCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { IAMClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { IamUser } from '../iam-user.resource.js';
import type { IamUserSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(IamUser)
export class AddIamUserResourceAction implements IResourceAction<IamUser> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
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
    const tags = iamUser.tags;

    // Get instances.
    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });

    // Create IAM user.
    const data = await iamClient.send(
      new CreateUserCommand({
        Tags: Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })),
        UserName: properties.username,
      }),
    );

    // Wait for iam-user to be created.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        const result = await iamClient.send(
          new GetUserCommand({
            UserName: properties.username,
          }),
        );

        return result?.User?.Arn === data.User!.Arn;
      },
      {
        initialDelayInMs: 5000,
        maxRetries: 36,
        retryDelayInMs: 1000,
      },
    );

    // Set response.
    response.Arn = data.User!.Arn!;
    response.policies = {};
    response.UserId = data.User!.UserId!;
    response.UserName = data.User!.UserName!;
  }

  async mock(diff: Diff<IamUser>, capture: Partial<IamUserSchema['response']>): Promise<void> {
    const iamUser = diff.node;
    const properties = iamUser.properties;

    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });
    iamClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateUserCommand) {
        return { User: { Arn: capture.Arn, UserId: capture.UserId, UserName: capture.UserName } };
      } else if (instance instanceof GetUserCommand) {
        return { User: { Arn: capture.Arn } };
      }
    };
  }
}

/**
 * @internal
 */
@Factory<AddIamUserResourceAction>(AddIamUserResourceAction)
export class AddIamUserResourceActionFactory {
  private static instance: AddIamUserResourceAction;

  static async create(): Promise<AddIamUserResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddIamUserResourceAction(container);
    }
    return this.instance;
  }
}
