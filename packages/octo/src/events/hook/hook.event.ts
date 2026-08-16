import { Event } from '../event.model.js';

/**
 * The HookEvent class is the superclass for all events emitting in relation to hooks.
 *
 * @group Events/Hooks
 */
export class HookEvent extends Event<void> {}
