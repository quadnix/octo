import { Schema } from '../functions/schema/schema.js';
import type { BaseAnchorSchema } from './anchor.schema.js';

/**
 * The schema every overlay schema extends.
 *
 * An overlay schema narrows `properties` to the fields the overlay carries.
 *
 * @example
 * ```ts
 * export class MyOverlaySchema extends BaseOverlaySchema {
 *   override properties = Schema<{ subnetName: string }>();
 * }
 * ```
 *
 * @group Overlays
 */
export class BaseOverlaySchema {
  /**
   * The anchors this overlay was built from, i.e. the models it joins.
   */
  anchors = Schema<BaseAnchorSchema[]>();

  /**
   * The ID of the overlay, unique across the infrastructure.
   */
  overlayId = Schema<string>();

  /**
   * The properties of the overlay.
   */
  properties = Schema<{ [key: string]: unknown }>();
}
