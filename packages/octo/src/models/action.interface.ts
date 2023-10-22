import { Diff } from '../functions/diff/diff.model.js';
import { Resource } from '../resources/resource.abstract.js';

export type IActionInputs = { [key: string]: string | Resource<unknown> };
export type IActionOutputs = { [key: string]: Resource<unknown> };

/**
 * Actions are translation functions between Diff and underlying infrastructure.
 * An action can translate a specific type of Diff into underlying infrastructure, and can revert it back.
 */
export interface IAction<I extends IActionInputs, O extends IActionOutputs> {
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
   * This function contains the list of outputs to save after processing the diff.
   * A missing output key will not be saved.
   */
  collectOutput(diff: Diff): (keyof O)[];

  /**
   * This function determines if the handle is applicable to the diff.
   */
  filter(diff: Diff): boolean;

  /**
   * This function contains the logic to apply the diff(s) to the underlying infrastructure.
   */
  handle(diff: Diff, actionInputs: I): O;

  /**
   * This function contains the logic to revert the diff(s) from the underlying infrastructure.
   */
  revert(diff: Diff, actionInputs: I, actionOutputs: O): O;
}
