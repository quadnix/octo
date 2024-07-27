import type { Constructable } from '../app.type.js';
import type { IModelAction } from '../models/model-action.interface.js';
import { AModel } from '../models/model.abstract.js';
import { AAnchor } from '../overlays/anchor.abstract.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import type { IResourceAction } from '../resources/resource-action.interface.js';
import { AResource } from '../resources/resource.abstract.js';
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

export class ModelActionRegistrationEvent extends RegistrationEvent {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: [IModelAction[]]): void {
      originalMethod.apply(this, args);

      for (const action of args[0]) {
        const event = new ModelActionRegistrationEvent(action.ACTION_NAME);
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

export class ResourceActionRegistrationEvent extends RegistrationEvent {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: [IResourceAction[]]): void {
      originalMethod.apply(this, args);

      for (const action of args[0]) {
        const event = new ResourceActionRegistrationEvent(action.ACTION_NAME);
        eventService.emit(event);
      }
    };
  }
}

export class ResourceRegistrationEvent extends RegistrationEvent {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: [string, Constructable<unknown>]): void {
      originalMethod.apply(this, args);

      if (args[1].prototype instanceof AResource) {
        const event = new ResourceRegistrationEvent(args[1].name);
        eventService.emit(event);
      }
    };
  }
}
