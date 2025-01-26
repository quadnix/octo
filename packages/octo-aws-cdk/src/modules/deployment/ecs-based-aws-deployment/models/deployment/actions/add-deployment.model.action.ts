import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import type { AwsDeploymentModule } from '../../../aws-deployment.module.js';
import { AwsDeployment } from '../aws.deployment.model.js';

@Action(AwsDeployment)
export class AddDeploymentModelAction implements IModelAction<AwsDeploymentModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsDeployment &&
      (diff.node.constructor as typeof AwsDeployment).NODE_NAME === 'deployment' &&
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
