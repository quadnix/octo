import type { ActionOutputs, EnhancedModuleSchema, UnknownModule } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';

/**
 * Model Actions are translation functions between Diff and underlying resources.
 * These actions can translate a specific type of Diff into individual resources.
 *
 * @group Models
 */
export interface IModelAction<T extends UnknownModule> {
  /**
   * This function determines if the handle is applicable to the diff.
   */
  filter(diff: Diff): boolean;

  /**
   * This function contains the logic to apply the diff(s) to the underlying infrastructure.
   */
  handle(diff: Diff, actionInputs: EnhancedModuleSchema<T>, actionOutputs: ActionOutputs): Promise<ActionOutputs>;
}
