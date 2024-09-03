import { Event } from '../event.model.js';

/**
 * The ErrorEvent class is the superclass for all events emitting an error.
 * An error event is generated when Octo encounters an error.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ErrorEvent<T extends Error> extends Event<T> {}
