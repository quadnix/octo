/**
 * Thrown by a module that cannot satisfy its inputs. Raise it from {@link AModule.onInit} to fail a run before anything is built.
 *
 * @group Errors/Module
 */
export class ModuleError extends Error {
  readonly module: string;

  /**
   * @param message The error message.
   * @param moduleName The module that raised it.
   */
  constructor(message: string, moduleName: string) {
    super(message);

    this.module = moduleName;

    Object.setPrototypeOf(this, ModuleError.prototype);
  }
}
