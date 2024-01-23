export interface IResource {
  readonly properties: { [key: string]: unknown };

  readonly resourceId: string;

  readonly response: { [key: string]: unknown };
}
