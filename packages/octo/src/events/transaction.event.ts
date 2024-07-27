import { Event } from './event.model.js';

export class TransactionEvent extends Event<string> {}

export class ModelActionTransactionEvent extends TransactionEvent {}

export class ResourceActionTransactionEvent extends TransactionEvent {}
