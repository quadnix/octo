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
import { AwsDeployment } from '../aws-deployment.model.js';

/**
 * A deployment creates nothing. The execution running it reads what it needs.
 *
 * @internal
 */
@Action(AwsDeployment)
export class AddAwsDeploymentModelAction implements IModelAction<AwsDeploymentModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsDeployment &&
      hasNodeName(diff.node, 'deployment') &&
      diff.field === 'deploymentTag'
    );
  }

  /**
   * @internal
   */
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
@Factory<AddAwsDeploymentModelAction>(AddAwsDeploymentModelAction)
export class AddAwsDeploymentModelActionFactory {
  private static instance: AddAwsDeploymentModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsDeploymentModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsDeploymentModelAction();
    }
    return this.instance;
  }
}
