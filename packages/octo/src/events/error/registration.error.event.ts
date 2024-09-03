import { ErrorEvent } from './error.event.js';

/**
 * This event is emitted at startup when a class fails to register.
 * It emits an [Error](https://nodejs.org/api/errors.html) object.
 *
 * @group Events
 * @returns The Event instance.
 */
export class RegistrationErrorEvent extends ErrorEvent<Error> {}
