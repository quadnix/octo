import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  hasNodeName,
} from '@quadnix/octo';
import { IamRole } from '../../../../../../resources/iam-role/index.js';
import type { AwsEcsServerModule } from '../../../aws-ecs-server.module.js';
import { AwsEcsServer } from '../aws-ecs-server.model.js';

/**
 * @internal
 */
@Action(AwsEcsServer)
export class AddAwsEcsServerModelAction implements IModelAction<AwsEcsServerModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcsServer &&
      hasNodeName(diff.node, 'server') &&
      diff.field === 'serverKey'
    );
  }

  async handle(
    _diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsEcsServerModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { iamRoleName } = actionInputs.metadata;

    // Create IAM Role.
    const iamRole = new IamRole(`iam-role-${iamRoleName}`, {
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
      rolename: iamRoleName,
    });

    actionOutputs[iamRole.resourceId] = iamRole;
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsEcsServerModelAction>(AddAwsEcsServerModelAction)
export class AddAwsEcsServerModelActionFactory {
  private static instance: AddAwsEcsServerModelAction;

  static async create(): Promise<AddAwsEcsServerModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcsServerModelAction();
    }
    return this.instance;
  }
}
