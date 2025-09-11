/**
 * Parent error class for all input errors.
 *
 * @group Errors/Input
 */
export class InputError extends Error {
  /**
   * Creates a new instance.
   *
   * @param message The error message.
   */
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, InputError.prototype);
  }
}

/**
 * Error class for input registration errors.
 * This error is thrown when an input key cannot be registered,
 * either because it has already been registered, or is not a valid input key,
 * or is not a valid input value.
 *
 * @group Errors/Input
 */
export class InputRegistrationError extends InputError {
  readonly inputKey: string;

  /**
   * Creates a new instance.
   *
   * @param message The error message.
   * @param inputKey The input key for which the error occurred.
   */
  constructor(message: string, inputKey: string) {
    super(message);

    this.inputKey = inputKey;

    Object.setPrototypeOf(this, InputRegistrationError.prototype);
  }
}

/**
 * Error class for input resolution errors.
 * This error is thrown when an input key cannot be resolved at runtime.
 * Some common reasons include invalid values found during resolution,
 * or invalid references used to resolve the input key.
 *
 * @group Errors/Input
 */
export class InputResolutionError extends InputError {
  readonly inputKey: string;

  /**
   * Creates a new instance.
   *
   * @param message The error message.
   * @param inputKey The input key for which the error occurred.
   */
  constructor(message: string, inputKey: string) {
    super(message);

    this.inputKey = inputKey;

    Object.setPrototypeOf(this, InputResolutionError.prototype);
  }
}
