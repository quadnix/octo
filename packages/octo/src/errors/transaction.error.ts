import { strict as assert } from 'assert';
import type { Diff } from '../functions/diff/diff.js';
import type { IResource } from '../resources/resource.interface.js';

export class TransactionError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}

export class DiffsOnDirtyResourcesTransactionError extends TransactionError {
  constructor(
    message: string,
    readonly diffs: ReturnType<Diff['toJSON']>[],
    readonly dirtyResources: IResource[],
  ) {
    super(message);
    assert(!!this.diffs);
    assert(!!this.dirtyResources);

    Object.setPrototypeOf(this, DiffsOnDirtyResourcesTransactionError.prototype);
  }
}
