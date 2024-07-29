import type { Constructable } from '../app.type.js';
import type { IModelAction } from '../models/model-action.interface.js';
import { AModel } from '../models/model.abstract.js';
import { AAnchor } from '../overlays/anchor.abstract.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import type { IResourceAction } from '../resources/resource-action.interface.js';
import { AResource } from '../resources/resource.abstract.js';
import type { EventService } from '../services/event/event.service.js';
import { Event } from './event.model.js';

/**
 * The RegistrationEvent class is the superclass for all events in relation to class registration.
 *
 * :::warning Warning
 * It is not a good practice to create an event from this class directly,
 * but should rather create one from one of the subclasses.
 * This promotes a more accurate classification of events.
 * :::
 *
 * @example
 * ```ts
 * const myEvent = new RegistrationEvent('MyClass');
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class RegistrationEvent extends Event<string> {}

/**
 * This event is emitted when a class with `@Anchor()` decorator is registered.
 * It emits the name of the class.
 *
 * @example
 * ```ts
 * const myEvent = new AnchorRegistrationEvent('MyClass');
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
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

/**
 * This event is emitted when a class with `@Action(ModelType.MODEL)` decorator is registered.
 * It emits the name of the class.
 *
 * @example
 * ```ts
 * const myEvent = new ModelActionRegistrationEvent('MyClass');
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
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

/**
 * This event is emitted when a class with `@Model()` decorator is registered.
 * It emits the name of the class.
 *
 * @example
 * ```ts
 * const myEvent = new ModelRegistrationEvent('MyClass');
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
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

/**
 * This event is emitted when a class with `@Overlay()` decorator is registered.
 * It emits the name of the class.
 *
 * @example
 * ```ts
 * const myEvent = new OverlayRegistrationEvent('MyClass');
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
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

/**
 * This event is emitted when a class with `@Action(ModelType.RESOURCE)` or `@Action(ModelType.SHARED_RESOURCE)`
 * decorator is registered.
 * It emits the name of the class.
 *
 * @example
 * ```ts
 * const myEvent = new ResourceActionRegistrationEvent('MyClass');
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
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

/**
 * This event is emitted when a class with `@Resource()` decorator is registered.
 * It emits the name of the class.
 *
 * @example
 * ```ts
 * const myEvent = new ResourceRegistrationEvent('MyClass');
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
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
