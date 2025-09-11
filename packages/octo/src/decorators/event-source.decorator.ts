import type { Constructable } from '../app.type.js';
import type { Event } from '../events/index.js';
import { EventService } from '../services/event/event.service.js';

/**
 * An `@EventSource` is a method decorator to enable automatic event emission.
 * The `registrar()` method of the Event class is used to decorate the method to auto-emit events.
 * - All event types must extend the {@link Event} class.
 *
 * @example
 * ```ts
 * @EventSource(MyEvent)
 * myMethod(): void { ... }
 * ```
 *
 * @group Decorators
 *
 * @internal
 *
 * @param ofType The type of event being emitted.
 *
 * @returns The decorated method.
 */
export function EventSource(
  ofType: Constructable<Event<unknown>>,
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    (ofType as any).registrar(EventService.getInstance(), descriptor);
  };
}
