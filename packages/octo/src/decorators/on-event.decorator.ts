import type { Constructable } from '../app.type.js';
import type { Event } from '../events/event.model.js';
import { EventService } from '../services/event/event.service.js';

export function OnEvent(
  ofType: Constructable<Event<unknown>>,
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    EventService.getInstance().registerListeners(ofType, target, descriptor);
  };
}
