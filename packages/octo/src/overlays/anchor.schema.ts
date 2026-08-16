import type { NodeType } from '../app.type.js';
import { Schema } from '../functions/schema/schema.js';
import type { IModelReference } from '../models/model.interface.js';

/**
 * The schema every anchor schema extends.
 *
 * An anchor schema narrows `properties` to the fields the anchor exposes. That shape is the contract
 * other modules match against, so treat a change to it as a breaking change.
 *
 * @example
 * ```ts
 * export class MyAnchorSchema extends BaseAnchorSchema {
 *   override properties = Schema<{ awsRegionId: string }>();
 * }
 * ```
 *
 * @group Overlays
 */
export class BaseAnchorSchema {
  /**
   * The ID of the anchor, unique within its parent.
   */
  anchorId = Schema<string>();

  /**
   * The model that declared the anchor.
   */
  parent = Schema<IModelReference & { type: NodeType }>();

  /**
   * The properties the anchor exposes, and that consumers filter on.
   */
  properties = Schema<{ [key: string]: unknown }>();
}
