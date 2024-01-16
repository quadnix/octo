import { ActionInputs, ActionOutputs, Diff, IAction } from '@quadnix/octo';

export abstract class AAction implements IAction<ActionInputs, ActionOutputs> {
  abstract readonly ACTION_NAME: string;

  collectInput(diff: Diff): string[] {
    return [];
  }

  abstract filter(diff: Diff): boolean;

  abstract handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs>;

  async postTransaction(diff: Diff): Promise<void> {
    return;
  }

  async revert(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    return {};
  }
}
