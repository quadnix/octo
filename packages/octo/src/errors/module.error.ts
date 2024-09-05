export class ModuleError extends Error {
  readonly module: string;

  constructor(message: string, moduleName: string) {
    super(message);

    this.module = moduleName;

    Object.setPrototypeOf(this, ModuleError.prototype);
  }
}

export class InvalidArgumentsModuleError extends ModuleError {
  readonly position: number;
  received: string;
  required: string;

  constructor(message: string, moduleName: string, position: number, required: string, received: string) {
    super(message, moduleName);

    this.position = position;
    this.received = received;
    this.required = required;

    Object.setPrototypeOf(this, InvalidArgumentsModuleError.prototype);
  }
}
