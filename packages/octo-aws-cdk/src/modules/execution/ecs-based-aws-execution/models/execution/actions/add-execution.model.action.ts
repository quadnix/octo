import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import type { AwsExecutionModule } from '../../../aws-execution.module.js';
import { AwsExecution } from '../aws.execution.model.js';

/**
 * @internal
 */
@Action(AwsExecution)
export class AddExecutionModelAction implements IModelAction<AwsExecutionModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsExecution &&
      (diff.node.constructor as typeof AwsExecution).NODE_NAME === 'execution' &&
      diff.field === 'executionId'
    );
  }

  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AwsExecutionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddExecutionModelAction>(AddExecutionModelAction)
export class AddExecutionModelActionFactory {
  private static instance: AddExecutionModelAction;

  static async create(): Promise<AddExecutionModelAction> {
    if (!this.instance) {
      this.instance = new AddExecutionModelAction();
    }
    return this.instance;
  }
}
