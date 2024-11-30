import { AttachRolePolicyCommand, DetachRolePolicyCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { type IIamRolePolicyDiff, IamRole, isAddPolicyDiff, isDeletePolicyDiff } from '../iam-role.resource.js';

@Action(IamRole)
export class UpdateIamRoleWithAwsPolicyResourceAction implements IResourceAction<IamRole> {
  constructor(private readonly container: Container) {}

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
    const iamClient = await this.container.get(IAMClient, {
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
    const iamClient = await this.container.get(IAMClient, {
      metadata: { package: '@octo' },
    });
    iamClient.send = async (instance: unknown): Promise<unknown> => {
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
    const container = Container.getInstance();
    return new UpdateIamRoleWithAwsPolicyResourceAction(container);
  }
}
