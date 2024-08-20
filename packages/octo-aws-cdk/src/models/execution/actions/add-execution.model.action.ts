import {
  Action,
  ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  NodeType,
} from '@quadnix/octo';
import { AwsExecution } from '../aws.execution.model.js';

@Action(NodeType.MODEL)
export class AddExecutionModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddExecutionModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsExecution &&
      diff.node.NODE_NAME === 'execution' &&
      diff.field === 'executionId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

@Factory<AddExecutionModelAction>(AddExecutionModelAction)
export class AddExecutionModelActionFactory {
  static async create(): Promise<AddExecutionModelAction> {
    return new AddExecutionModelAction();
  }
}
