export enum HOOK_NAMES {
  ADD_DEPLOYMENT = 'addDeployment',
  ADD_ENVIRONMENT = 'addEnvironment',
  ADD_EXECUTION = 'addExecution',
  ADD_IMAGE = 'addImage',
  ADD_PIPELINE = 'addPipeline',
  ADD_REGION = 'addRegion',
  ADD_SERVER = 'addServer',
  ADD_SERVICE = 'addService',
  ADD_SUPPORT = 'addSupport',
}

/**
 * Hooks provide a way to trigger custom functions in response to an app state change.
 * This interface defines the basic structure of a hook.
 */
export interface IHook {
  /**
   * The name of the hook.
   * The name is also used to trigger the hook, as well as handle the hook.
   */
  readonly HOOK_NAME: HOOK_NAMES;

  /**
   * List of arguments passed to the handle function.
   */
  readonly args: any[];

  /**
   * This function contains the hook's logic.
   */
  handle(...args: any[]): void;
}
