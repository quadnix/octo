import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import { IamRole } from '../../../../../../resources/iam-role/index.js';
import type { AwsIamRoleAnchor } from '../../../anchors/aws-iam-role.anchor.js';
import type { AwsServerModule } from '../../../aws-server.module.js';
import { AwsServer } from '../aws.server.model.js';

@Action(AwsServer)
export class AddServerModelAction implements IModelAction<AwsServerModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsServer &&
      (diff.node.constructor as typeof AwsServer).NODE_NAME === 'server' &&
      diff.field === 'serverKey'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsServerModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const server = diff.node as AwsServer;
    const awsIamRoleAnchor = server.getAnchor('AwsIamRoleAnchor') as AwsIamRoleAnchor;
    const serverIamRoleName = awsIamRoleAnchor.properties.iamRoleName;

    // Create IAM Role.
    const iamRole = new IamRole(`iam-role-${serverIamRoleName}`, {
      awsAccountId: actionInputs.inputs.account.accountId,
      policies: [
        {
          policy: 'ecs-tasks.amazonaws.com',
          policyId: 'AmazonECSTasksAssumeRolePolicy',
          policyType: 'assume-role-policy',
        },
        {
          policy: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
          policyId: 'AmazonECSTaskExecutionRolePolicy',
          policyType: 'aws-policy',
        },
      ],
      rolename: `iam-role-${serverIamRoleName}`,
    });

    actionOutputs[iamRole.resourceId] = iamRole;
    return actionOutputs;
  }
}

@Factory<AddServerModelAction>(AddServerModelAction)
export class AddServerModelActionFactory {
  private static instance: AddServerModelAction;

  static async create(): Promise<AddServerModelAction> {
    if (!this.instance) {
      this.instance = new AddServerModelAction();
    }
    return this.instance;
  }
}
