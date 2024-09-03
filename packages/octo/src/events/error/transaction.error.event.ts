import { ErrorEvent } from './error.event.js';
import type { DiffsOnDirtyResourcesTransactionError } from '../../errors/index.js';

/**
 * This event is emitted when a transaction encounters an error.
 *
 * @group Events
 * @returns The Event instance.
 */
export class TransactionErrorEvent<T extends Error> extends ErrorEvent<T> {}

/**
 * This event is emitted when a transaction attempted to apply diffs on dirty resources.
 *
 * @group Events
 * @returns The Event instance.
 */
// eslint-disable-next-line max-len
export class DiffsOnDirtyResourcesTransactionErrorEvent extends TransactionErrorEvent<DiffsOnDirtyResourcesTransactionError> {}
