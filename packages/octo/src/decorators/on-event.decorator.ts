import type { AbstractConstructable } from '../app.type.js';
import type { Event } from '../events/index.js';
import { EventService } from '../services/event/event.service.js';

/**
 * An `@OnEvent` is a method decorator to listen to an event.
 *
 * Octo narrates everything it does as {@link Event}s. Subscribing is how you add logging, reporting,
 * or notifications without changing the framework. A handler receives every event that is an instance
 * of the given type, so listening to a base class such as {@link TransactionEvent} catches all of its
 * subclasses.
 *
 * @example
 * ```ts
 * // Async handler.
 * @OnEvent(MyEvent)
 * async onEvent(event: MyEvent): Promise<void> { ... }
 *
 * // Sync handler.
 * @OnEvent(MyEvent)
 * onEvent(event: MyEvent): void { ... }
 * ```
 * @group Decorators
 * @param ofType The type of event being listened to.
 * @returns The decorated method.
 */
export function OnEvent(
  ofType: AbstractConstructable<Event<unknown>>,
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
  return function (target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    EventService.getInstance().registerListeners(ofType, target, descriptor);
  };
}
