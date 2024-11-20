import type { BaseAnchorSchema } from './anchor.schema.js';

export class BaseOverlaySchema {
  anchors: BaseAnchorSchema[];

  overlayId: string;

  properties: { [key: string]: unknown };
}
