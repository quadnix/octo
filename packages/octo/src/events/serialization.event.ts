import type { ModelSerializedOutput, ResourceSerializedOutput } from '../app.type.js';
import type { EventService } from '../services/event/event.service.js';
import type { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import type { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { Event } from './event.model.js';

/**
 * The SerializationEvent class is the superclass for all events in relation to serialization and deserialization.
 *
 * @group Events
 * @returns The Event instance.
 */
export class SerializationEvent<T> extends Event<T> {}

/**
 * This event is emitted when models are deserialized from serialized output.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ModelDeserializedEvent extends SerializationEvent<ModelSerializedOutput> {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod: (
      ...args: Parameters<ModelSerializationService['deserialize']>
    ) => ReturnType<ModelSerializationService['deserialize']> = descriptor.value;

    descriptor.value = async function (
      ...args: Parameters<ModelSerializationService['deserialize']>
    ): ReturnType<ModelSerializationService['deserialize']> {
      const result = await originalMethod.apply(this, args);

      eventService.emit(new ModelDeserializedEvent(undefined, args[0]));

      return result;
    };
  }
}

/**
 * This event is emitted when models are serialized to an output.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ModelSerializedEvent extends SerializationEvent<ModelSerializedOutput> {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod: (
      ...args: Parameters<ModelSerializationService['serialize']>
    ) => ReturnType<ModelSerializationService['serialize']> = descriptor.value;

    descriptor.value = async function (
      ...args: Parameters<ModelSerializationService['serialize']>
    ): ReturnType<ModelSerializationService['serialize']> {
      const result = await originalMethod.apply(this, args);

      eventService.emit(new ModelSerializedEvent(undefined, result));

      return result;
    };
  }
}

/**
 * This event is emitted when resources are deserialized from serialized output.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ResourceDeserializedEvent extends SerializationEvent<{
  actual: ResourceSerializedOutput;
  old: ResourceSerializedOutput;
}> {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod: (
      ...args: Parameters<ResourceSerializationService['deserialize']>
    ) => ReturnType<ResourceSerializationService['deserialize']> = descriptor.value;

    descriptor.value = async function (
      ...args: Parameters<ResourceSerializationService['deserialize']>
    ): ReturnType<ResourceSerializationService['deserialize']> {
      await originalMethod.apply(this, args);

      eventService.emit(new ResourceDeserializedEvent(undefined, { actual: args[0], old: args[1] }));
    };
  }
}

/**
 * This event is emitted when actual resources are serialized to an output.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ActualResourceSerializedEvent extends SerializationEvent<ResourceSerializedOutput> {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod: (
      ...args: Parameters<ResourceSerializationService['serializeActualResources']>
    ) => ReturnType<ResourceSerializationService['serializeActualResources']> = descriptor.value;

    descriptor.value = async function (
      ...args: Parameters<ResourceSerializationService['serializeActualResources']>
    ): ReturnType<ResourceSerializationService['serializeActualResources']> {
      const result = await originalMethod.apply(this, args);

      eventService.emit(new ActualResourceSerializedEvent(undefined, result));

      return result;
    };
  }
}

/**
 * This event is emitted when new resources are serialized to an output.
 *
 * @group Events
 * @returns The Event instance.
 */
export class NewResourceSerializedEvent extends SerializationEvent<ResourceSerializedOutput> {
  static override registrar(eventService: EventService, descriptor: PropertyDescriptor): void {
    const originalMethod: (
      ...args: Parameters<ResourceSerializationService['serializeNewResources']>
    ) => ReturnType<ResourceSerializationService['serializeNewResources']> = descriptor.value;

    descriptor.value = async function (
      ...args: Parameters<ResourceSerializationService['serializeNewResources']>
    ): ReturnType<ResourceSerializationService['serializeNewResources']> {
      const result = await originalMethod.apply(this, args);

      eventService.emit(new NewResourceSerializedEvent(undefined, result));

      return result;
    };
  }
}
