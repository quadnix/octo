import { Diff, DiffAction } from '../functions/diff/diff.model';
import { Model } from './model.abstract';

export interface IModel<I, T> {
  /**
   * The name of the model.
   */
  readonly MODEL_NAME: string;

  /**
   * The dependency map of fields, representing an array of dependencies on other model fields.
   * This map is transient, i.e. it is not synthesized, so cannot be constructed back.
   * It categorizes the dependencies by model's field, by the action on that field, and an array of dependencies.
   * A dependency consists of reference to the parent model, parent model's field on whom dependency is created,
   * and finally the action for which dependency is being created.
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
   */
  diff(previous?: T): Diff[];

  /**
   * Generate a serializable representation of model as per model's interface.
   */
  synth(): I;
}
