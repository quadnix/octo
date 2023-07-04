import { Diff } from '../functions/diff/diff.model';

export interface IAction {
  /**
   * The name of the action.
   */
  readonly ACTION_NAME: string;

  /**
   * This function determines if the handle is applicable to the diff.
   */
  filter(diff: Diff): boolean;

  /**
   * This function contains the logic to apply the diff to the underlying infrastructure.
   */
  handle(diffs: Diff[]): Promise<void>;
}
