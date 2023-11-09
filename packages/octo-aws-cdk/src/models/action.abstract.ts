import { ActionInputs, ActionOutputs, Diff, IAction } from '@quadnix/octo';

export abstract class AAction implements IAction<ActionInputs, ActionOutputs> {
  abstract readonly ACTION_NAME: string;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  collectInput(diff: Diff): string[] {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  collectOutput(diff: Diff): string[] {
    return [];
  }

  abstract filter(diff: Diff): boolean;

  abstract handle(diff: Diff, actionInputs: ActionInputs): ActionOutputs;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async postTransaction(diff: Diff): Promise<void> {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  revert(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): ActionOutputs {
    return {};
  }
}
