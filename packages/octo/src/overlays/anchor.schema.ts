import type { IModelReference } from '../models/model.interface.js';

export class BaseAnchorSchema {
  anchorId: string;

  parent: IModelReference;

  properties: { [key: string]: unknown };
}
