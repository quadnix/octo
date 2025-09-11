import { Event } from './event.model.js';

/**
 * The ActionEvent class is the superclass for all events within actions.
 * This can be used to emit log events within actions.
 *
 * @group Events/Action
 *
 * @returns The Event instance.
 */
export class ActionEvent extends Event<{ message: string; metadata: Record<string, unknown> }> {}
