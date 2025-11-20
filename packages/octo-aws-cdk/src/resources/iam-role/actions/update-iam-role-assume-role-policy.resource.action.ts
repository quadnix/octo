import { IAMClient, UpdateAssumeRolePolicyCommand } from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { IAMClientFactory } from '../../../factories/aws-client.factory.js';
import { IamRole } from '../iam-role.resource.js';
import type { IamRoleSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(IamRole)
export class UpdateIamRoleAssumeRolePolicyResourceAction implements IResourceAction<IamRole> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof IamRole &&
      hasNodeName(diff.node, 'iam-role') &&
      diff.field === 'assume-role-policy'
    );
  }

  async handle(diff: Diff<IamRole>): Promise<IamRoleSchema['response']> {
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

    // Update IAM role assume role policies.
    await iamClient.send(
      new UpdateAssumeRolePolicyCommand({
        PolicyDocument: JSON.stringify({
          Statement: policyDocument,
          Version: '2012-10-17',
        }),
        RoleName: properties.rolename,
      }),
    );

    return response;
  }

  async mock(diff: Diff<IamRole>): Promise<IamRoleSchema['response']> {
    const iamRole = diff.node;
    return iamRole.response;
  }
}

/**
 * @internal
 */
@Factory<UpdateIamRoleAssumeRolePolicyResourceAction>(UpdateIamRoleAssumeRolePolicyResourceAction)
export class UpdateIamRoleAssumeRolePolicyResourceActionFactory {
  private static instance: UpdateIamRoleAssumeRolePolicyResourceAction;

  static async create(): Promise<UpdateIamRoleAssumeRolePolicyResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateIamRoleAssumeRolePolicyResourceAction(container);
    }
    return this.instance;
  }
}
