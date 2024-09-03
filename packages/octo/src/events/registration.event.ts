import { AModel } from '../models/model.abstract.js';
import { AAnchor } from '../overlays/anchor.abstract.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import { AResource } from '../resources/resource.abstract.js';
import type { EventService } from '../services/event/event.service.js';
import type { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import type { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import type { TransactionService } from '../services/transaction/transaction.service.js';
import { Event } from './event.model.js';

/**
 * The RegistrationEvent class is the superclass for all events in relation to class registration.
 *
 * @group Events
 * @returns The Event instance.
 */
export class RegistrationEvent extends Event<string> {}

/**
 * This event is emitted when a class with `@Anchor()` decorator is registered.
 * It emits the name of the class.
 *
 * @group Events
 * @returns The Event instance.
 */
export class AnchorRegistrationEvent extends RegistrationEvent {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod: (
      ...args: Parameters<ModelSerializationService['registerClass']>
    ) => ReturnType<ModelSerializationService['registerClass']> = descriptor.value;

    descriptor.value = function (
      ...args: Parameters<ModelSerializationService['registerClass']>
    ): ReturnType<ModelSerializationService['registerClass']> {
      originalMethod.apply(this, args);

      if (args[1].prototype instanceof AAnchor) {
        eventService.emit(new AnchorRegistrationEvent(args[1].name));
      }
    };
  }
}

/**
 * This event is emitted when a class with `@Action(ModelType.MODEL)` decorator is registered.
 * It emits the name of the class.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ModelActionRegistrationEvent extends RegistrationEvent {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    type MethodParameters =
      | Parameters<TransactionService['registerModelActions']>
      | Parameters<TransactionService['registerOverlayActions']>;
    type MethodReturnType =
      | ReturnType<TransactionService['registerModelActions']>
      | ReturnType<TransactionService['registerOverlayActions']>;

    const originalMethod: (...args: MethodParameters) => MethodReturnType = descriptor.value;

    descriptor.value = function (...args: MethodParameters): MethodReturnType {
      originalMethod.apply(this, args);

      for (const action of args[0]) {
        eventService.emit(new ModelActionRegistrationEvent(action.ACTION_NAME));
      }
    };
  }
}

/**
 * This event is emitted when a class with `@Model()` decorator is registered.
 * It emits the name of the class.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ModelRegistrationEvent extends RegistrationEvent {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod: (
      ...args: Parameters<ModelSerializationService['registerClass']>
    ) => ReturnType<ModelSerializationService['registerClass']> = descriptor.value;

    descriptor.value = function (
      ...args: Parameters<ModelSerializationService['registerClass']>
    ): ReturnType<ModelSerializationService['registerClass']> {
      originalMethod.apply(this, args);

      if (args[1].prototype instanceof AModel) {
        eventService.emit(new ModelRegistrationEvent(args[1].name));
      }
    };
  }
}

/**
 * This event is emitted when a class with `@Overlay()` decorator is registered.
 * It emits the name of the class.
 *
 * @group Events
 * @returns The Event instance.
 */
export class OverlayRegistrationEvent extends RegistrationEvent {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod: (
      ...args: Parameters<ModelSerializationService['registerClass']>
    ) => ReturnType<ModelSerializationService['registerClass']> = descriptor.value;

    descriptor.value = function (
      ...args: Parameters<ModelSerializationService['registerClass']>
    ): ReturnType<ModelSerializationService['registerClass']> {
      originalMethod.apply(this, args);

      if (args[1].prototype instanceof AOverlay) {
        eventService.emit(new OverlayRegistrationEvent(args[1].name));
      }
    };
  }
}

/**
 * This event is emitted when a class with `@Action(ModelType.RESOURCE)` or `@Action(ModelType.SHARED_RESOURCE)`
 * decorator is registered.
 * It emits the name of the class.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ResourceActionRegistrationEvent extends RegistrationEvent {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod: (
      ...args: Parameters<TransactionService['registerResourceActions']>
    ) => ReturnType<TransactionService['registerResourceActions']> = descriptor.value;

    descriptor.value = function (
      ...args: Parameters<TransactionService['registerResourceActions']>
    ): ReturnType<TransactionService['registerResourceActions']> {
      originalMethod.apply(this, args);

      for (const action of args[0]) {
        eventService.emit(new ResourceActionRegistrationEvent(action.ACTION_NAME));
      }
    };
  }
}

/**
 * This event is emitted when a class with `@Resource()` decorator is registered.
 * It emits the name of the class.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ResourceRegistrationEvent extends RegistrationEvent {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod: (
      ...args: Parameters<ResourceSerializationService['registerClass']>
    ) => ReturnType<ResourceSerializationService['registerClass']> = descriptor.value;

    descriptor.value = function (
      ...args: Parameters<ResourceSerializationService['registerClass']>
    ): ReturnType<ResourceSerializationService['registerClass']> {
      originalMethod.apply(this, args);

      if (args[1].prototype instanceof AResource) {
        eventService.emit(new ResourceRegistrationEvent(args[1].name));
      }
    };
  }
}
