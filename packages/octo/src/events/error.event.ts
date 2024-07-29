import { Event } from './event.model.js';

/**
 * The ErrorEvent class is the superclass for all events emitting an error.
 * An error event is generated when Octo encounters an error.
 *
 * :::warning Warning
 * It is not a good practice to create an event from this class directly,
 * but should rather create one from one of the subclasses.
 * This promotes a more accurate classification of events.
 * :::
 *
 * @example
 * ```ts
 * const myEvent = new ErrorEvent(new Error('e'));
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class ErrorEvent extends Event<Error> {}

/**
 * This event is emitted at startup when a class fails to register.
 * It emits the [Error](https://nodejs.org/api/errors.html) object.
 *
 * @example
 * ```ts
 * const myEvent = new RegistrationErrorEvent(new Error('e'));
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class RegistrationErrorEvent extends ErrorEvent {}
