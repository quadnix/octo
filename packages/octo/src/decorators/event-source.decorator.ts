import type { Constructable } from '../app.type.js';
import type { Event } from '../functions/event/event.model.js';
import { EventService } from '../services/event/event.service.js';

export function EventSource(
  ofType: Constructable<Event<unknown>>,
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    (ofType as any).registrar(EventService.getInstance(), descriptor);
  };
}
