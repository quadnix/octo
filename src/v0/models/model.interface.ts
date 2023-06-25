import { Diff } from '../functions/diff/diff.model';

export interface IModel<I, T> {
  /**
   * Create a duplicate instance of this model.
   */
  clone(): T;

  /**
   * Generate a diff comparing all children of self with previous instance.
   * If previous does not exist, diff adds all children of self.
   */
  diff(previous?: T): Diff[];

  /**
   * Get a string representation of context.
   */
  getContext(): string;

  /**
   * Generate a serializable representation of model as per model's interface.
   */
  synth(): I;
}
