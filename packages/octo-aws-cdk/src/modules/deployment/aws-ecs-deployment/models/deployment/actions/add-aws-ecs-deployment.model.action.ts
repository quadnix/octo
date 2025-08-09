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
import type { AwsEcsDeploymentModule } from '../../../aws-ecs-deployment.module.js';
import { AwsEcsDeployment } from '../aws-ecs-deployment.model.js';

/**
 * @internal
 */
@Action(AwsEcsDeployment)
export class AddAwsEcsDeploymentModelAction implements IModelAction<AwsEcsDeploymentModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcsDeployment &&
      hasNodeName(diff.node, 'deployment') &&
      diff.field === 'deploymentTag'
    );
  }

  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AwsEcsDeploymentModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsEcsDeploymentModelAction>(AddAwsEcsDeploymentModelAction)
export class AddAwsEcsDeploymentModelActionFactory {
  private static instance: AddAwsEcsDeploymentModelAction;

  static async create(): Promise<AddAwsEcsDeploymentModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcsDeploymentModelAction();
    }
    return this.instance;
  }
}
