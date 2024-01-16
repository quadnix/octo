import { ActionInputs, ActionOutputs } from '../app.type.js';
import { Diff } from '../functions/diff/diff.model.js';

/**
 * Actions are translation functions between Diff and underlying infrastructure.
 * An action can translate a specific type of Diff into underlying infrastructure, and can revert it back.
 */
export interface IAction<I extends ActionInputs, O extends ActionOutputs> {
  /**
   * The name of the action.
   * It can be used to easily identify an action and its purpose.
   */
  readonly ACTION_NAME: string;

  /**
   * This function contains the list of inputs to ask before processing the diff.
   * A missing input key will not be populated in the inputs provided to the action.
   */
  collectInput(diff: Diff): (keyof I)[];

  /**
   * This function determines if the handle is applicable to the diff.
   */
  filter(diff: Diff): boolean;

  /**
   * This function contains the logic to apply the diff(s) to the underlying infrastructure.
   */
  handle(diff: Diff, actionInputs: I): Promise<O>;

  /**
   * This function contains the logic to revert the diff(s) from the underlying infrastructure.
   */
  revert(diff: Diff, actionInputs: I, actionOutputs: O): O;
}
