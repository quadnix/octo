export interface IHook {
  /**
   * The name of the hook.
   */
  readonly HOOK_NAME: string;

  /**
   * List of arguments passed to the handle function.
   */
  readonly args: any[];

  /**
   * This function contains the hook's logic.
   */
  handle(...args: any[]): void;
}
