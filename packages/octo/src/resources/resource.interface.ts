export interface IResource {
  readonly parents: string[];

  readonly properties: { [key: string]: boolean | number | string };

  readonly resourceId: string;

  readonly response: { [key: string]: boolean | number | string };
}
