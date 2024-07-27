import { Event } from './event.model.js';

export class SerializationEvent extends Event<void> {}

export class ModelDeserializedEvent extends SerializationEvent {}

export class ModelSerializedEvent extends SerializationEvent {}

export class ResourceDeserializedEvent extends SerializationEvent {}

export class ResourceSerializedEvent extends SerializationEvent {}
