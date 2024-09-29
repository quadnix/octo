import { AttachRolePolicyCommand, DetachRolePolicyCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { IIamRolePolicyDiff, IamRole, isAddPolicyDiff, isDeletePolicyDiff } from '../iam-role.resource.js';

@Action(IamRole)
export class UpdateIamRoleWithAwsPolicyResourceAction implements IResourceAction {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof IamRole &&
      (diff.node.constructor as typeof IamRole).NODE_NAME === 'iam-role' &&
      diff.field === 'aws-policy'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamRole = diff.node as IamRole;
    const iamRolePolicyDiff = diff.value as IIamRolePolicyDiff;
    const response = iamRole.response;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    // Attach AWS policies to IAM Role.
    if (isAddPolicyDiff(iamRolePolicyDiff)) {
      await iamClient.send(
        new AttachRolePolicyCommand({
          PolicyArn: iamRolePolicyDiff.policy as string,
          RoleName: response.RoleName,
        }),
      );
    } else if (isDeletePolicyDiff(iamRolePolicyDiff)) {
      await iamClient.send(
        new DetachRolePolicyCommand({
          PolicyArn: iamRolePolicyDiff.policyId,
          RoleName: response.RoleName,
        }),
      );
    }
  }

  async mock(): Promise<void> {
    const iamClient = await Container.get(IAMClient);
    iamClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof AttachRolePolicyCommand) {
        return;
      } else if (instance instanceof DetachRolePolicyCommand) {
        return;
      }
    };
  }
}

@Factory<UpdateIamRoleWithAwsPolicyResourceAction>(UpdateIamRoleWithAwsPolicyResourceAction)
export class UpdateIamRoleWithAwsPolicyResourceActionFactory {
  static async create(): Promise<UpdateIamRoleWithAwsPolicyResourceAction> {
    return new UpdateIamRoleWithAwsPolicyResourceAction();
  }
}
