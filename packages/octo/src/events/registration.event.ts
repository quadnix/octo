import type { Constructable } from '../app.type.js';
import { AModel } from '../models/model.abstract.js';
import { AAnchor } from '../overlays/anchor.abstract.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import type { EventService } from '../services/event/event.service.js';
import { Event } from './event.model.js';

export class RegistrationEvent extends Event<string> {}

export class AnchorRegistrationEvent extends RegistrationEvent {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: [string, Constructable<unknown>]): void {
      originalMethod.apply(this, args);

      if (args[1].prototype instanceof AAnchor) {
        const event = new AnchorRegistrationEvent(args[1].name);
        eventService.emit(event);
      }
    };
  }
}

export class ModelRegistrationEvent extends RegistrationEvent {
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

export class OverlayRegistrationEvent extends RegistrationEvent {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: [string, Constructable<unknown>]): void {
      originalMethod.apply(this, args);

      if (args[1].prototype instanceof AOverlay) {
        const event = new OverlayRegistrationEvent(args[1].name);
        eventService.emit(event);
      }
    };
  }
}
