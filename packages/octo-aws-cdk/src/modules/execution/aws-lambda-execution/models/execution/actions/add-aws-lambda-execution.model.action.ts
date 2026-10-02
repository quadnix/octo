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
import type { AwsLambdaExecutionModule } from '../../../aws-lambda-execution.module.js';
import { AwsLambdaExecution } from '../aws-lambda-execution.model.js';

/**
 * @internal
 */
@Action(AwsLambdaExecution)
export class AddAwsLambdaExecutionModelAction implements IModelAction<AwsLambdaExecutionModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsLambdaExecution &&
      hasNodeName(diff.node, 'execution') &&
      diff.field === 'executionId'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AwsLambdaExecutionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsLambdaExecutionModelAction>(AddAwsLambdaExecutionModelAction)
export class AddAwsLambdaExecutionModelActionFactory {
  private static instance: AddAwsLambdaExecutionModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsLambdaExecutionModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsLambdaExecutionModelAction();
    }
    return this.instance;
  }
}
