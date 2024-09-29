import { IAMClient, UpdateAssumeRolePolicyCommand } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { IIamRoleAssumeRolePolicy } from '../iam-role.interface.js';
import { IamRole } from '../iam-role.resource.js';

@Action(IamRole)
export class UpdateIamRoleAssumeRolePolicyResourceAction implements IResourceAction {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof IamRole &&
      (diff.node.constructor as typeof IamRole).NODE_NAME === 'iam-role' &&
      diff.field === 'assume-role-policy'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamRole = diff.node as IamRole;
    const properties = iamRole.properties;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    const policyDocument: { Action: string; Effect: 'Allow'; Principal: { Service: string } }[] = [];

    const assumeRolePolicies = properties.policies.filter((p) => p.policyType === 'assume-role-policy');
    for (const policy of assumeRolePolicies) {
      if ((policy.policy as IIamRoleAssumeRolePolicy) === 'ecs-tasks.amazonaws.com') {
        policyDocument.push({
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'ecs-tasks.amazonaws.com',
          },
        });
      }
    }

    // Update IAM role assume role policy.
    await iamClient.send(
      new UpdateAssumeRolePolicyCommand({
        PolicyDocument: JSON.stringify({
          Statement: policyDocument,
          Version: '2012-10-17',
        }),
        RoleName: properties.rolename,
      }),
    );
  }

  async mock(): Promise<void> {
    const iamClient = await Container.get(IAMClient);
    iamClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof UpdateAssumeRolePolicyCommand) {
        return;
      }
    };
  }
}

@Factory<UpdateIamRoleAssumeRolePolicyResourceAction>(UpdateIamRoleAssumeRolePolicyResourceAction)
export class UpdateIamRoleAssumeRolePolicyResourceActionFactory {
  static async create(): Promise<UpdateIamRoleAssumeRolePolicyResourceAction> {
    return new UpdateIamRoleAssumeRolePolicyResourceAction();
  }
}
