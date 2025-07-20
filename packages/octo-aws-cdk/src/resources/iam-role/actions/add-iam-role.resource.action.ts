import { CreateRoleCommand, GetRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { IAMClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { IamRole } from '../iam-role.resource.js';
import type { IamRoleSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(IamRole)
export class AddIamRoleResourceAction implements IResourceAction<IamRole> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
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

    const policyDocument: { Action: string; Effect: 'Allow'; Principal: { Service: string } }[] = [];

    const assumeRolePolicies = properties.policies.filter((p) => p.policyType === 'assume-role-policy');
    for (const policy of assumeRolePolicies) {
      if (policy.policy === 'ecs-tasks.amazonaws.com') {
        policyDocument.push({
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'ecs-tasks.amazonaws.com',
          },
        });
      }
    }

    // Create IAM role with assume role policies.
    const data = await iamClient.send(
      new CreateRoleCommand({
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: policyDocument,
          Version: '2012-10-17',
        }),
        RoleName: properties.rolename,
      }),
    );

    // Wait for iam-role to be created.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        const result = await iamClient.send(
          new GetRoleCommand({
            RoleName: properties.rolename,
          }),
        );

        return result?.Role?.Arn === data.Role!.Arn;
      },
      {
        initialDelayInMs: 5000,
        maxRetries: 36,
        retryDelayInMs: 1000,
      },
    );

    // Set response.
    response.Arn = data.Role!.Arn!;
    response.policies = {};
    response.RoleId = data.Role!.RoleId!;
    response.RoleName = data.Role!.RoleName!;
  }

  async mock(diff: Diff<IamRole>, capture: Partial<IamRoleSchema['response']>): Promise<void> {
    // Get properties.
    const iamRole = diff.node;
    const properties = iamRole.properties;

    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });
    iamClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateRoleCommand) {
        return { Role: { Arn: capture.Arn, RoleId: capture.RoleId, RoleName: capture.RoleName } };
      } else if (instance instanceof GetRoleCommand) {
        return { Role: { Arn: capture.Arn } };
      }
    };
  }
}

/**
 * @internal
 */
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
