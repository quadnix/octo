import { Action, DiffAction, Factory, ModelType } from '@quadnix/octo';
import type { ActionOutputs, Diff, IModelAction } from '@quadnix/octo';
import { AwsExecution } from '../aws.execution.model.js';

@Action(ModelType.MODEL)
export class AddExecutionModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddExecutionModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof AwsExecution &&
      diff.model.MODEL_NAME === 'execution' &&
      diff.field === 'executionId'
    );
  }

  async handle(): Promise<ActionOutputs> {
    return {};
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddExecutionModelAction>(AddExecutionModelAction)
export class AddExecutionModelActionFactory {
  static async create(): Promise<AddExecutionModelAction> {
    return new AddExecutionModelAction();
  }
}
