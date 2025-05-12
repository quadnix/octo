import type { EventService } from '../services/event/event.service.js';

/**
 * The Event class is the superclass for all events.
 * An event is generated when something important happens in Octo.
 * The body of the event contains a header, name (optional), and payload (optional).
 *
 * @example
 * ```ts
 * const myEvent = new Event<{ value: string }>('event name', { value: 'my payload' });
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class Event<T> {
  readonly header: {
    timestamp: number;
  };

  readonly name: string | undefined;

  readonly payload: T | undefined;

  constructor(name?: string, payload?: T) {
    this.header = {
      timestamp: Date.now(),
    };
    this.name = name;
    this.payload = payload;
  }

  /**
   * The `registrar()` method is explicitly called by the {@link EventSource} decorator for a method
   * to enhance that method to auto-emit events.
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
