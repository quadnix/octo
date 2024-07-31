import type { ModelType } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';

/**
 * {@link AModel} interface.
 */
export interface IModel<I, T> {
  /**
   * The unique name of the node.
   * All nodes with same name are of the same category.
   */
  readonly MODEL_NAME: string;

  /**
   * The type of the node.
   */
  readonly MODEL_TYPE: ModelType;

  /**
   * {@inheritDoc AModel.diff}
   */
  diff(previous?: T): Promise<Diff[]>;

  /**
   * {@inheritDoc AModel.diffProperties}
   */
  diffProperties(previous: T): Promise<Diff[]>;

  /**
   * {@inheritDoc AModel.setContext}
   */
  setContext(): string;

  /**
   * {@inheritDoc AModel.synth}
   */
  synth(): I;
}

/**
 * Model Reference encapsulates identification information of self.
 */
export interface IModelReference {
  context: string;
}
