import type { UnknownModel } from '../app.type.js';
import type { BaseAnchorSchema } from './anchor.schema.js';

/**
 * @internal
 */
export interface IAnchor<S extends BaseAnchorSchema, T extends UnknownModel> {
  getParent(): T;

  synth(): S;
}
