import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import type { DiffAction } from '../functions/diff/diff.js';
import { Event } from './event.model.js';

/**
 * The TransactionEvent class is the superclass for all events in relation to transactions.
 * A transaction processes actions generated from model and resource diffs.
 *
 * @group Events
 * @returns The Event instance.
 */
export class TransactionEvent<T> extends Event<T> {}

/**
 * This event is emitted when a model action in a transaction is done executing.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ModelActionTransactionEvent extends TransactionEvent<void> {}

/**
 * This event is emitted when transaction prepares a model diff.

 * @group Events
 * @returns The Event instance.
 */
export class ModelDiffsTransactionEvent extends TransactionEvent<DiffMetadata[][]> {}

/**
 * This event is emitted when transaction prepares a model transaction.

 * @group Events
 * @returns The Event instance.
 */
export class ModelTransactionTransactionEvent extends TransactionEvent<DiffMetadata[][]> {}

/**
 * This event is emitted when a resource action in a transaction is done executing.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ResourceActionCompletedTransactionEvent extends TransactionEvent<string> {}

/**
 * This event is emitted when a resource action in a transaction begins executing.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ResourceActionInitiatedTransactionEvent extends TransactionEvent<string> {}

export class ResourceActionSummaryTransactionEvent extends TransactionEvent<{
  diffAction: DiffAction;
  diffField: string;
  resourceId: string;
  values: { current: unknown; previous: unknown };
}> {}

/**
 * This event is emitted when transaction prepares a resource diff.

 * @group Events
 * @returns The Event instance.
 */
export class ResourceDiffsTransactionEvent extends TransactionEvent<[DiffMetadata[][], DiffMetadata[][]]> {}

/**
 * This event is emitted when transaction prepares a resource transaction.

 * @group Events
 * @returns The Event instance.
 */
export class ResourceTransactionTransactionEvent extends TransactionEvent<[DiffMetadata[][], DiffMetadata[][]]> {}
