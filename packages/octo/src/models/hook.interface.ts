import { Model } from './model.abstract';

export enum HOOK_ACTION {
  ADD = 'add',
  REMOVE = 'remove',
}

/**
 * Hooks provide a way to trigger custom functions in response to an app state change.
 * This interface defines the basic structure of a hook.
 */
export interface IHook {
  filter(hookAction: HOOK_ACTION, model: Model<unknown, unknown>): boolean;

  handle(model: Model<unknown, unknown>): void;
}
