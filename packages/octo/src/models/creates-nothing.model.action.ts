import type { ActionOutputs, IUnknownModelAction } from '../app.type.js';

/**
 * Applies every diff of a node that creates nothing, declared with `createsNothing`, by doing nothing.
 *
 * @internal
 */
export class CreatesNothingModelAction implements IUnknownModelAction {
  /**
   * @internal
   */
  filter(): boolean {
    return true;
  }

  /**
   * @internal
   */
  async handle(_diff: unknown, _actionInputs: unknown, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    return actionOutputs;
  }
}
