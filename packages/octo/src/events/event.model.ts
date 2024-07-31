import type { EventService } from '../services/event/event.service.js';

/**
 * The Event class is the superclass for all events.
 * An event is generated when something important happens in Octo.
 * The body of the event contains a header, a payload, and an optional user data.
 *
 * :::warning Warning
 * It is not a good practice to create an event from this class directly,
 * but should rather create one from one of the subclasses.
 * This promotes a more accurate classification of events.
 * :::
 *
 * @example
 * ```ts
 * const myEvent = new Event<string>('my payload', { key: 'value' });
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class Event<T> {
  readonly header: {
    timestamp: number;
  };

  readonly payload: T;

  readonly userData: object;

  constructor(payload: T, userData: object = {}) {
    this.header = {
      timestamp: Date.now(),
    };
    this.payload = payload;
    this.userData = userData;
  }

  /**
   * The `registrar()` method is explicitly called by the {@link EventSource} decorator for a method
   * to enhance the method to auto-emit events.
   *
   * @param args Arguments are spread out using the array spread operator.
   * - args[0] - Instance of {@link EventService}.
   * - args[1] - [PropertyDescriptor](https://www.typescriptlang.org/docs/handbook/decorators.html).
   */
  static registrar(...args: [EventService, PropertyDescriptor]): void {
    if (args.length !== 2) {
      throw new Error('Invalid number of args in event registrar!');
    }

    throw new Error('Method not implemented! Use derived class implementation');
  }
}
