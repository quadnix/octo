import { Diff } from '../functions/diff/diff.model';

/**
 * Models are the building blocks that can be combined to create any infrastructure.
 * This interface outlines the basic structure that any model must have.
 * Models have fields (class properties), and functions.
 */
export interface IModel<I, T> {
  /**
   * This is the unique name of the model.
   * It is used to identify other instances of the same model.
   */
  readonly MODEL_NAME: string;

  /**
   * The type of model. Can only be either "model" or "resource".
   */
  readonly MODEL_TYPE: 'model' | 'resource';

  /**
   * Generate a diff comparing all children of self with previous instance.
   * If previous does not exist, diff adds all children of self.
   *
   * Diff captures change. So fields that do not change, e.g. ID fields, do not need to be diffed.
   */
  diff(previous?: T): Promise<Diff[]>;

  /**
   * Generates a string representation of self, used to identify the uniqueness of the instance.
   */
  getContext(): string;

  /**
   * Generate a serializable representation of self as per model's interface.
   */
  synth(): I;
}

/**
 * Model Reference encapsulates identification information of self.
 */
export interface IModelReference {
  context: string;
}
