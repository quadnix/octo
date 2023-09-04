import { Diff, IAction, IActionInputs, IActionOutputs } from '@quadnix/octo';

export abstract class Action implements IAction<IActionInputs, IActionOutputs> {
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

  abstract handle(diff: Diff, actionInputs: IActionInputs): IActionOutputs;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async postTransaction(diff: Diff): Promise<void> {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  revert(diff: Diff, actionInputs: IActionInputs, actionOutputs: IActionOutputs): IActionOutputs {
    return {};
  }
}
