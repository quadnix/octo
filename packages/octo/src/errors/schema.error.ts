/**
 * Thrown when a value does not satisfy the schema it is being read as - a property missing, or one that cannot be resolved.
 *
 * @group Errors/Schema
 */
export class SchemaError extends Error {
  readonly schemaClassName: string;

  /**
   * @param message The error message.
   * @param schemaClassName The schema the value was being read as.
   */
  constructor(message: string, schemaClassName: string) {
    super(message);

    this.schemaClassName = schemaClassName;

    Object.setPrototypeOf(this, SchemaError.prototype);
  }
}
