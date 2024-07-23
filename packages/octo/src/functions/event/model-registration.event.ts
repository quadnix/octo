import type { Constructable } from '../../app.type.js';
import { AModel } from '../../models/model.abstract.js';
import { Event } from './event.model.js';
import type { EventService } from '../../services/event/event.service.js';

export class ModelRegistrationEvent extends Event<string> {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: [string, Constructable<unknown>]): void {
      originalMethod.apply(this, args);

      if (args[1].prototype instanceof AModel) {
        const event = new ModelRegistrationEvent(args[1].name);
        eventService.emit(event);
      }
    };
  }
}
