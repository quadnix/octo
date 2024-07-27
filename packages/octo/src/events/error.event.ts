import { Event } from './event.model.js';

export class ErrorEvent extends Event<Error> {}

export class RegistrationErrorEvent extends ErrorEvent {}
