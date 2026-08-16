import type { EventService } from '../services/event/event.service.js';

/**
 * The superclass of every event Octo emits.
 *
 * Octo narrates its whole run as events - what registered, what changed, what terraform did, what
 * each mode concluded. Subscribe with {@link OnEvent} to build logging, reporting, or notifications
 * on top of a run without touching the framework. You can emit your own events too.
 *
 * @example
 * ```ts
 * const myEvent = new Event<{ value: string }>('event name', { value: 'my payload' });
 * EventService.getInstance().emit(myEvent);
 * ```
 *
 * @group Events
 */
export class Event<T = undefined> {
  /**
   * When the event was created.
   */
  readonly header: {
    timestamp: number;
  };

  /**
   * The subject of the event, when the event type alone does not identify it - e.g. the class name
   * on a registration event. Empty otherwise.
   */
  readonly name: string;

  /**
   * The event's data. Its shape is fixed by the event type.
   */
  readonly payload: T;

  /**
   * @param name The subject of the event, when the event type alone does not identify it.
   * @param payload The event's data.
   */
  constructor(name?: string, payload?: T) {
    this.header = {
      timestamp: Date.now(),
    };
    this.name = name || '';
    this.payload = payload as T;
  }

  /**
   * The `registrar()` method is explicitly called by the {@link EventSource} decorator for a method
   * to enhance that method to auto-emit events.
   *
   * @internal
   * @param args Arguments are spread out using the array spread operator.
   * - args[0] - Instance of {@link EventService}.
   * - args[1] - [PropertyDescriptor](https://www.typescriptlang.org/docs/handbook/decorators.html).
   *
   */
  static registrar(...args: [EventService, PropertyDescriptor]): void {
    if (args.length !== 2) {
      throw new Error('Invalid number of args in event registrar!');
    }

    throw new Error('Method not implemented! Use derived class implementation');
  }
}
