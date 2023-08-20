export interface IResource {
  readonly properties: { [key: string]: boolean | number | string };

  readonly resourceId: string;

  readonly response: { [key: string]: boolean | number | string };
}
