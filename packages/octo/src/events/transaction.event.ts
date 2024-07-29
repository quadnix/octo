import { Event } from './event.model.js';

/**
 * The TransactionEvent class is the superclass for all events in relation to transactions.
 * A transaction processes actions generated from model and resource diffs.
 * Thus, the events are usually in relation with these actions.
 *
 * :::warning Warning
 * It is not a good practice to create an event from this class directly,
 * but should rather create one from one of the subclasses.
 * This promotes a more accurate classification of events.
 * :::
 *
 * @example
 * ```ts
 * const myEvent = new TransactionEvent('MyActionName');
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class TransactionEvent extends Event<string> {}

/**
 * This event is emitted when a model action is done executing.
 *
 * @example
 * ```ts
 * const myEvent = new ModelActionTransactionEvent('MyActionName');
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class ModelActionTransactionEvent extends TransactionEvent {}

/**
 * This event is emitted when a resource action is done executing.
 *
 * @example
 * ```ts
 * const myEvent = new ResourceActionTransactionEvent('MyActionName');
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class ResourceActionTransactionEvent extends TransactionEvent {}
