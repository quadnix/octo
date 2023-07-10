import { Diff, DiffAction } from '../functions/diff/diff.model';
import { Model } from './model.abstract';

/**
 * Models are building blocks that can be combined to create any infrastructure.
 * This interface outlines the basic structure that any model must have.
 * Models have fields (class properties), and functions.
 */
export interface IModel<I, T> {
  /**
   * This is the unique name of the model.
   * It is used to identify other models of its kind.
   */
  readonly MODEL_NAME: string;

  /**
   * This is a map of fields and its dependencies on other model fields.
   * It is used to determine action execution order.
   * It simply represents the association between two models using Diff actions.
   * A dependency simply consists of another model, a field in that model, and a Diff action.
   * A field can have more than one dependencies.
   * E.g. "when adding a field in this model, ensure the field in dependent model is added before this".
   *
   * Note: This map is transient, i.e. it is not synthesized, so cannot be constructed back.
   * This means an external state of the app (in JSON format), when un-synthesized, will not have this map set.
   */
  readonly dependencies: {
    [key in keyof I]?: { [key in DiffAction]?: [Model<unknown, unknown>, string, DiffAction][] };
  };

  /**
   * Create a duplicate instance of this model.
   */
  clone(): T;

  /**
   * Generate a diff comparing all children of self with previous instance.
   * If previous does not exist, diff adds all children of self.
   *
   * Diff captures change. So fields that do not change, e.g. ID fields, do not need to be diffed.
   */
  diff(previous?: T): Diff[];

  /**
   * Determines if the instance is the same as self.
   */
  isEqual(instance: T): boolean;

  /**
   * Generate a serializable representation of model as per model's interface.
   */
  synth(): I;
}
