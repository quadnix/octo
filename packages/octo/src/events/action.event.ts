import type { DiffAction } from '../functions/diff/diff.js';
import { Event } from './event.model.js';

/**
 * This event is emitted for each `log()` an action makes. `diff` names what the action was running
 * for: the context of its model, overlay or resource, and the diff's action and field.
 *
 * @group Events/Action
 */
export class ActionEvent extends Event<{
  diff: { action: DiffAction; field: string; node: string };
  message: string;
  metadata: Record<string, unknown>;
}> {}
