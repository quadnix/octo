import { AttachRolePolicyCommand, DetachRolePolicyCommand, IAMClient } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import { IamRole, type IamRoleAwsPolicyDiff } from '../iam-role.resource.js';

@Action(NodeType.RESOURCE)
export class UpdateIamRoleWithAwsPolicyResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateIamRoleWithAwsPolicyResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof IamRole &&
      diff.node.NODE_NAME === 'iam-role' &&
      diff.field === 'attachAwsPolicy'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamRole = diff.node as IamRole;
    const response = iamRole.response;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    const policiesToAdd = (diff.value as IamRoleAwsPolicyDiff).add;
    const policiesToRemove = (diff.value as IamRoleAwsPolicyDiff).remove;

    if (policiesToAdd.length > 0) {
      await Promise.all(
        policiesToAdd.map((policyArn) =>
          iamClient.send(
            new AttachRolePolicyCommand({
              PolicyArn: policyArn,
              RoleName: response.RoleName,
            }),
          ),
        ),
      );

      // Set response.
      if (!('aws' in response.policies)) {
        response.policies['aws'] = [];
      }
      response.policies['aws'].push(...policiesToAdd);
    }

    if (policiesToRemove.length > 0) {
      await Promise.all(
        policiesToRemove.map((policyArn) =>
          iamClient.send(
            new DetachRolePolicyCommand({
              PolicyArn: policyArn,
              RoleName: response.RoleName,
            }),
          ),
        ),
      );

      // Set response.
      for (const policy of policiesToRemove) {
        const index = response.policies['aws'].indexOf(policy);
        if (index > -1) {
          response.policies['aws'].splice(index, 1);
        }
      }
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
