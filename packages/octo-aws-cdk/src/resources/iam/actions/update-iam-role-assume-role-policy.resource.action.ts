import { IAMClient, UpdateAssumeRolePolicyCommand } from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, NodeType } from '@quadnix/octo';
import { IamRole } from '../iam-role.resource.js';

@Action(NodeType.RESOURCE)
export class UpdateIamRoleAssumeRolePolicyResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateIamRoleAssumeRolePolicyResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof IamRole &&
      diff.node.NODE_NAME === 'iam-role' &&
      diff.field === 'allowToAssumeRoleForServices'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamRole = diff.node as IamRole;
    const properties = iamRole.properties;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    const assumeRolePolicyDocumentStatements: { Action: string; Effect: string; Principal: { Service: string } }[] = [];
    for (const service of properties.allowToAssumeRoleForServices) {
      if (service === 'ecs-tasks.amazonaws.com') {
        assumeRolePolicyDocumentStatements.push({
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
          Statement: assumeRolePolicyDocumentStatements,
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
