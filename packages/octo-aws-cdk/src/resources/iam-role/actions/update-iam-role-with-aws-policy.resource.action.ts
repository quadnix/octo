import { AttachRolePolicyCommand, DetachRolePolicyCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { IAMClientFactory } from '../../../factories/aws-client.factory.js';
import { type IIamRolePolicyDiff, IamRole, isAddPolicyDiff, isDeletePolicyDiff } from '../iam-role.resource.js';
import type { IamRoleSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(IamRole)
export class UpdateIamRoleWithAwsPolicyResourceAction implements IResourceAction<IamRole> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof IamRole &&
      hasNodeName(diff.node, 'iam-role') &&
      diff.field === 'aws-policy'
    );
  }

  async handle(diff: Diff<IamRole, IIamRolePolicyDiff>): Promise<IamRoleSchema['response']> {
    // Get properties.
    const iamRole = diff.node;
    const properties = iamRole.properties;
    const response = iamRole.response;
    const iamRolePolicyDiff = diff.value;

    // Get instances.
    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });

    // Attach AWS policies to IAM Role.
    if (isAddPolicyDiff(iamRolePolicyDiff)) {
      await iamClient.send(
        new AttachRolePolicyCommand({
          PolicyArn: iamRolePolicyDiff.policy as string,
          RoleName: response.RoleName,
        }),
      );

      // Set response.
      if (!response.policies) {
        response.policies = {};
      }
      response.policies![iamRolePolicyDiff.policyId] = [iamRolePolicyDiff.policy as string];
    } else if (isDeletePolicyDiff(iamRolePolicyDiff)) {
      await iamClient.send(
        new DetachRolePolicyCommand({
          PolicyArn: iamRolePolicyDiff.policyId,
          RoleName: response.RoleName,
        }),
      );

      // Set response.
      if (!Object.isFrozen(response)) {
        delete response.policies![iamRolePolicyDiff.policyId];
      }
    }

    return response;
  }

  async mock(diff: Diff<IamRole, IIamRolePolicyDiff>): Promise<IamRoleSchema['response']> {
    // Get properties.
    const iamRole = diff.node;
    const response = iamRole.response;
    const iamRolePolicyDiff = diff.value;

    // Attach AWS policies to IAM Role.
    if (isAddPolicyDiff(iamRolePolicyDiff)) {
      if (!response.policies) {
        response.policies = {};
      }
      response.policies![iamRolePolicyDiff.policyId] = [iamRolePolicyDiff.policy as string];
    } else if (isDeletePolicyDiff(iamRolePolicyDiff)) {
      if (!Object.isFrozen(response)) {
        delete response.policies![iamRolePolicyDiff.policyId];
      }
    }

    return response;
  }
}

/**
 * @internal
 */
@Factory<UpdateIamRoleWithAwsPolicyResourceAction>(UpdateIamRoleWithAwsPolicyResourceAction)
export class UpdateIamRoleWithAwsPolicyResourceActionFactory {
  private static instance: UpdateIamRoleWithAwsPolicyResourceAction;

  static async create(): Promise<UpdateIamRoleWithAwsPolicyResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateIamRoleWithAwsPolicyResourceAction(container);
    }
    return this.instance;
  }
}
