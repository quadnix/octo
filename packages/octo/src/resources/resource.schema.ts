export class BaseResourceSchema {
  properties: { [key: string]: unknown };

  resourceId: string;

  response: { [key: string]: unknown };
}
