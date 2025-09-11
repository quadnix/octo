import { Schema } from '../functions/schema/schema.js';
import type { BaseAnchorSchema } from './anchor.schema.js';

/**
 * @group Overlays
 */
export class BaseOverlaySchema {
  anchors = Schema<BaseAnchorSchema[]>();

  overlayId = Schema<string>();

  properties = Schema<{ [key: string]: unknown }>();
}
