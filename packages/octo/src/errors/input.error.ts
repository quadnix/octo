export class InputError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, InputError.prototype);
  }
}

export class InputRegistrationError extends InputError {
  readonly inputKey: string;

  constructor(message: string, inputKey: string) {
    super(message);

    this.inputKey = inputKey;

    Object.setPrototypeOf(this, InputRegistrationError.prototype);
  }
}

export class InputResolutionError extends InputError {
  readonly inputKey: string;

  constructor(message: string, inputKey: string) {
    super(message);

    this.inputKey = inputKey;

    Object.setPrototypeOf(this, InputResolutionError.prototype);
  }
}
