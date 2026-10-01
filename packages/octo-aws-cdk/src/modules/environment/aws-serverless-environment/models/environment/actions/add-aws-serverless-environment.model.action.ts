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
import type { AwsServerlessEnvironmentModule } from '../../../aws-serverless-environment.module.js';
import { AwsServerlessEnvironment } from '../aws-serverless-environment.model.js';

/**
 * A serverless environment creates nothing.
 *
 * @internal
 */
@Action(AwsServerlessEnvironment)
export class AddAwsServerlessEnvironmentModelAction implements IModelAction<AwsServerlessEnvironmentModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsServerlessEnvironment &&
      hasNodeName(diff.node, 'environment') &&
      diff.field === 'environmentName'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff<AwsServerlessEnvironment>,
    _actionInputs: EnhancedModuleSchema<AwsServerlessEnvironmentModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsServerlessEnvironmentModelAction>(AddAwsServerlessEnvironmentModelAction)
export class AddAwsServerlessEnvironmentModelActionFactory {
  private static instance: AddAwsServerlessEnvironmentModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsServerlessEnvironmentModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsServerlessEnvironmentModelAction();
    }
    return this.instance;
  }
}
