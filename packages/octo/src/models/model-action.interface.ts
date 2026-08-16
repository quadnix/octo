import type { ActionOutputs, EnhancedModuleSchema, UnknownModule } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';

/**
 * A model action translates a change in intent into resources.
 *
 * Octo diffs your models, and for every {@link Diff} it produces it asks each registered action
 * whether the diff is its concern. The actions that accept it declare the resources that change
 * has to bring about. This is the only place a model becomes infrastructure.
 *
 * Register the class with {@link Action}, and a {@link Factory} to construct it.
 *
 * @group Models
 *
 * @see Definition of [Actions](/docs/fundamentals/actions).
 */
export interface IModelAction<T extends UnknownModule> {
  /**
   * Whether this action handles the given diff.
   * Typically a check on the diff's node, field, and action.
   */
  filter(diff: Diff): boolean;

  /**
   * Declares the resources this diff calls for.
   *
   * @param diff The diff that passed {@link IModelAction.filter}.
   * @param actionInputs The module's inputs, metadata, and the nodes it produced.
   * @param actionOutputs The resources declared so far by earlier actions in this transaction.
   * @returns `actionOutputs`, with this action's resources added.
   */
  handle(diff: Diff, actionInputs: EnhancedModuleSchema<T>, actionOutputs: ActionOutputs): Promise<ActionOutputs>;
}
