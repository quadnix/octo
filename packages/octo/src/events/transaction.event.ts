import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import type { BaseResourceSchema } from '../resources/resource.schema.js';
import { Event } from './event.model.js';

/**
 * The TransactionEvent class is the superclass for all events in relation to transactions.
 * A transaction processes actions generated from model and resource diffs.
 *
 * @group Events/Transaction
 *
 * @returns The Event instance.
 */
export class TransactionEvent<T> extends Event<T> {}

/**
 * This event is emitted when a model action in a transaction is done executing.
 *
 * @group Events/Transaction
 *
 * @returns The Event instance.
 */
export class ModelActionTransactionEvent extends TransactionEvent<void> {}

/**
 * This event is emitted when transaction prepares a model diff.

 * @group Events/Transaction
 *
 * @returns The Event instance.
 */
export class ModelDiffsTransactionEvent extends TransactionEvent<DiffMetadata[][]> {}

/**
 * This event is emitted when transaction prepares a model transaction.

 * @group Events/Transaction
 *
 * @returns The Event instance.
 */
export class ModelTransactionTransactionEvent extends TransactionEvent<DiffMetadata[][]> {}

/**
 * This event is emitted when a resource action in a transaction is done executing.
 *
 * @group Events/Transaction
 *
 * @returns The Event instance.
 */
export class ResourceActionCompletedTransactionEvent extends TransactionEvent<DiffMetadata> {}

/**
 * This event is emitted pre-transaction to provide information for resource actions about to be executed
 * in the transaction.
 *
 * @group Events/Transaction
 *
 * @returns The Event instance.
 */
export class ResourceActionInformationTransactionEvent extends TransactionEvent<{
  action: { name: string };
  capture?: { response: Partial<BaseResourceSchema['response']> };
  diff: DiffMetadata;
}> {}

/**
 * This event is emitted when a resource action in a transaction begins executing.
 *
 * @group Events/Transaction
 *
 * @returns The Event instance.
 */
export class ResourceActionInitiatedTransactionEvent extends TransactionEvent<DiffMetadata> {}

/**
 * This event is emitted when a resource action in a transaction is done executing.
 * It emits a summary of the action.
 *
 * @group Events/Transaction
 *
 * @returns The Event instance.
 */
export class ResourceActionSummaryTransactionEvent extends TransactionEvent<{
  diff: DiffMetadata;
  values: { current: unknown; previous: unknown };
}> {}

/**
 * This event is emitted when transaction prepares a resource diff.

 * @group Events/Transaction
 *
 * @returns The Event instance.
 */
export class ResourceDiffsTransactionEvent extends TransactionEvent<[DiffMetadata[][], DiffMetadata[][]]> {}

/**
 * This event is emitted when transaction prepares a resource transaction.

 * @group Events/Transaction
 *
 * @returns The Event instance.
 */
export class ResourceTransactionTransactionEvent extends TransactionEvent<[DiffMetadata[][], DiffMetadata[][]]> {}
