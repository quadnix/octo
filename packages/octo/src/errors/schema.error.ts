/**
 * Thrown when a value does not satisfy the schema it is being read as - a property missing, or one that cannot be resolved.
 *
 * @group Errors/Schema
 */
export class SchemaError extends Error {
  readonly schemaClassName: string;

  /**
   * What a validator threw underneath, where this error is wrapping one. Carried as a property of
   * its own rather than as the `Error` cause: without it a nested property's failure reads only as
   * the name of the top-level input it arrived under, and which value failed is the whole question.
   */
  readonly validationError?: unknown;

  /**
   * @param message The error message.
   * @param schemaClassName The schema the value was being read as.
   * @param validationError What a validator threw underneath, where there is one.
   */
  constructor(message: string, schemaClassName: string, validationError?: unknown) {
    super(message);

    this.schemaClassName = schemaClassName;
    if (validationError !== undefined) {
      this.validationError = validationError;
    }

    Object.setPrototypeOf(this, SchemaError.prototype);
  }
}
