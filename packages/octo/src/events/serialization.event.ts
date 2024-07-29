import { Event } from './event.model.js';

/**
 * The SerializationEvent class is the superclass for all events in relation to serialization and deserialization.
 *
 * :::warning Warning
 * It is not a good practice to create an event from this class directly,
 * but should rather create one from one of the subclasses.
 * This promotes a more accurate classification of events.
 * :::
 *
 * @example
 * ```ts
 * const myEvent = new SerializationEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class SerializationEvent extends Event<void> {}

/**
 * This event is emitted when models are deserialized from serialized output.
 *
 * @example
 * ```ts
 * const myEvent = new ModelDeserializedEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class ModelDeserializedEvent extends SerializationEvent {}

/**
 * This event is emitted when models are serialized to an output.
 *
 * @example
 * ```ts
 * const myEvent = new ModelSerializedEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class ModelSerializedEvent extends SerializationEvent {}

/**
 * This event is emitted when resources are deserialized from serialized output.
 *
 * @example
 * ```ts
 * const myEvent = new ResourceDeserializedEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class ResourceDeserializedEvent extends SerializationEvent {}

/**
 * This event is emitted when resources are serialized to an output.
 *
 * @example
 * ```ts
 * const myEvent = new ResourceSerializedEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class ResourceSerializedEvent extends SerializationEvent {}
