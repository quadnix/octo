import {
  Action,
  ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  ModelType,
} from '@quadnix/octo';
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

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    return actionOutputs;
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
