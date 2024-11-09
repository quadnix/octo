export class ModuleError extends Error {
  readonly module: string;

  constructor(message: string, moduleName: string) {
    super(message);

    this.module = moduleName;

    Object.setPrototypeOf(this, ModuleError.prototype);
  }
}
