import { Diff } from '../functions/diff/diff.model';

export type IActionInputRequest = string[];
export type IActionInputResponse = { [key: string]: string };

/**
 * Actions are translation functions between Diff and underlying infrastructure.
 * An action can translate a specific type of Diff into underlying infrastructure, and can revert it back.
 */
export interface IAction {
  /**
   * The name of the action.
   * It can be used to easily identify an action and its purpose.
   */
  readonly ACTION_NAME: string;

  /**
   * This function contains the list of inputs to ask before processing the diff.
   */
  collectInput(diff: Diff): IActionInputRequest;

  /**
   * This function determines if the handle is applicable to the diff.
   */
  filter(diff: Diff): boolean;

  /**
   * This function contains the logic to apply the diff(s) to the underlying infrastructure.
   */
  handle(diff: Diff, actionInput: IActionInputResponse): Promise<void>;

  /**
   * This function contains the logic to revert the diff(s) from the underlying infrastructure.
   */
  revert(diff: Diff): Promise<void>;
}
