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
import type { AwsDeploymentModule } from '../../../aws-deployment.module.js';
import { AwsDeployment } from '../aws.deployment.model.js';

/**
 * @internal
 */
@Action(AwsDeployment)
export class AddDeploymentModelAction implements IModelAction<AwsDeploymentModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsDeployment &&
      hasNodeName(diff.node, 'deployment') &&
      diff.field === 'deploymentTag'
    );
  }

  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AwsDeploymentModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddDeploymentModelAction>(AddDeploymentModelAction)
export class AddDeploymentModelActionFactory {
  private static instance: AddDeploymentModelAction;

  static async create(): Promise<AddDeploymentModelAction> {
    if (!this.instance) {
      this.instance = new AddDeploymentModelAction();
    }
    return this.instance;
  }
}
