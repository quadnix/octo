import { DeletePolicyCommand, DeleteRoleCommand, DetachRolePolicyCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { IAMClientFactory } from '../../../factories/aws-client.factory.js';
import { IamRole } from '../iam-role.resource.js';

@Action(IamRole)
export class DeleteIamRoleResourceAction implements IResourceAction<IamRole> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
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
    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });

    // Delete all policies.
    const promiseToDeleteAllPolicies: Promise<any>[] = [];
    for (const policy of properties.policies) {
      if (policy.policyType === 'assume-role-policy') {
        continue;
      }

      if (policy.policyType === 'aws-policy') {
        promiseToDeleteAllPolicies.push(
          iamClient.send(
            new DetachRolePolicyCommand({
              PolicyArn: policy.policy,
              RoleName: response.RoleName,
            }),
          ),
        );
      } else {
        const policyARNs = response.policies[policy.policyId] || [];
        promiseToDeleteAllPolicies.push(
          Promise.all(
            policyARNs.map(async (policyArn) => {
              await iamClient.send(
                new DetachRolePolicyCommand({
                  PolicyArn: policyArn,
                  RoleName: response.RoleName,
                }),
              );
              await iamClient.send(
                new DeletePolicyCommand({
                  PolicyArn: policyArn,
                }),
              );
            }),
          ),
        );
      }
    }
    await Promise.all(promiseToDeleteAllPolicies);

    // Delete IAM role.
    await iamClient.send(
      new DeleteRoleCommand({
        RoleName: response.RoleName,
      }),
    );
  }

  async mock(diff: Diff): Promise<void> {
    const iamRole = diff.node as IamRole;
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
