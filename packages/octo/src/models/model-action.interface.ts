import type { ActionInputs, ActionOutputs } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';

/**
 * Model Actions are translation functions between Diff and underlying resources.
 * These actions can translate a specific type of Diff into individual resources.
 */
export interface IModelAction {
  /**
   * The name of the action.
   * It can be used to easily identify an action and its purpose.
   */
  readonly ACTION_NAME: string;

  /**
   * This function contains the list of inputs to ask before processing the diff.
   * A missing input key will not be populated in the inputs provided to the action.
   */
  collectInput(diff: Diff): Extract<keyof ActionInputs, string>[];

  /**
   * This function determines if the handle is applicable to the diff.
   */
  filter(diff: Diff): boolean;

  /**
   * This function contains the logic to apply the diff(s) to the underlying infrastructure.
   */
  handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs>;
}
