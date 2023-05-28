import { Diff } from '../utility/diff.utility';

export interface IModel<T> {
  /**
   * Create a duplicate instance of this model.
   */
  clone(): T;

  /**
   * Generate a diff comparing all children of self with latest instance.
   */
  diff(latest: T): Diff[];

  /**
   * Get a string representation of context.
   */
  getContext(): string;
}
