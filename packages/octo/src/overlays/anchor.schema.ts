import type { NodeType } from '../app.type.js';
import { Schema } from '../functions/schema/schema.js';
import type { IModelReference } from '../models/model.interface.js';

export class BaseAnchorSchema {
  anchorId = Schema<string>();

  parent = Schema<IModelReference & { type: NodeType }>();

  properties = Schema<{ [key: string]: unknown }>();
}
