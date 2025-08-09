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
import type { AwsEcsExecutionModule } from '../../../aws-ecs-execution.module.js';
import { AwsEcsExecution } from '../aws-ecs-execution.model.js';

/**
 * @internal
 */
@Action(AwsEcsExecution)
export class AddAwsEcsExecutionModelAction implements IModelAction<AwsEcsExecutionModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcsExecution &&
      hasNodeName(diff.node, 'execution') &&
      diff.field === 'executionId'
    );
  }

  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AwsEcsExecutionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsEcsExecutionModelAction>(AddAwsEcsExecutionModelAction)
export class AddAwsEcsExecutionModelActionFactory {
  private static instance: AddAwsEcsExecutionModelAction;

  static async create(): Promise<AddAwsEcsExecutionModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcsExecutionModelAction();
    }
    return this.instance;
  }
}
