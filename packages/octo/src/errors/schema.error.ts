export class SchemaError extends Error {
  readonly schemaClassName: string;

  constructor(message: string, schemaClassName: string) {
    super(message);

    this.schemaClassName = schemaClassName;

    Object.setPrototypeOf(this, SchemaError.prototype);
  }
}
