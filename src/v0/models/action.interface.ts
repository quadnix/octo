import { Diff } from '../functions/diff/diff.model';

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
   * This function determines if the handle is applicable to the diff.
   */
  filter(diff: Diff): boolean;

  /**
   * This function contains the logic to apply the diff(s) to the underlying infrastructure.
   */
  handle(diffs: Diff[]): Promise<void>;

  /**
   * This function contains the logic to revert the diff(s) from the underlying infrastructure.
   */
  revert(diffs: Diff[]): Promise<void>;
}
