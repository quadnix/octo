import { CreateUserCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { IamUser } from '../iam-user.resource.js';
import type { IamUserSchema } from '../iam-user.schema.js';

@Action(IamUser)
export class AddIamUserResourceAction implements IResourceAction<IamUser> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof IamUser &&
      (diff.node.constructor as typeof IamUser).NODE_NAME === 'iam-user' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamUser = diff.node as IamUser;
    const properties = iamUser.properties;
    const response = iamUser.response;

    // Get instances.
    const iamClient = await this.container.get(IAMClient, {
      metadata: { awsAccountId: properties.awsAccountId, package: '@octo' },
    });

    // Create IAM user.
    const data = await iamClient.send(
      new CreateUserCommand({
        UserName: properties.username,
      }),
    );

    // Set response.
    response.Arn = data.User!.Arn!;
    response.policies = {};
    response.UserId = data.User!.UserId!;
    response.UserName = data.User!.UserName!;
  }

  async mock(diff: Diff, capture: Partial<IamUserSchema['response']>): Promise<void> {
    const iamUser = diff.node as IamUser;
    const properties = iamUser.properties;

    const iamClient = await this.container.get(IAMClient, {
      metadata: { awsAccountId: properties.awsAccountId, package: '@octo' },
    });
    iamClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateUserCommand) {
        return { User: { Arn: capture.Arn, UserId: capture.UserId, UserName: capture.UserName } };
      }
    };
  }
}

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
