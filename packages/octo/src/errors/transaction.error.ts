import type { UnknownResource } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';
import type { IModelAction } from '../models/model-action.interface.js';
import type { IResource } from '../resources/resource.interface.js';
import type { ValidationService } from '../services/validation/validation.service.js';

export class TransactionError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}

export class DiffsOnDirtyResourcesTransactionError extends TransactionError {
  readonly diffs: ReturnType<Diff['toJSON']>[];
  readonly dirtyResources: IResource[];

  constructor(message: string, diffs: Diff[], dirtyResources: UnknownResource[]) {
    super(message);

    this.diffs = diffs.map((d) => d.toJSON());
    this.dirtyResources = dirtyResources.map((r) => r.synth());

    Object.setPrototypeOf(this, DiffsOnDirtyResourcesTransactionError.prototype);
  }
}

export class InputNotFoundTransactionError extends TransactionError {
  readonly action: string;
  readonly diff: ReturnType<Diff['toJSON']>;
  readonly key: string;

  constructor(message: string, action: IModelAction, diff: Diff, key: string) {
    super(message);

    this.action = action.ACTION_NAME;
    this.diff = diff.toJSON();
    this.key = key;

    Object.setPrototypeOf(this, InputNotFoundTransactionError.prototype);
  }
}

export class NoMatchingActionFoundTransactionError extends TransactionError {
  readonly diff: ReturnType<Diff['toJSON']>;

  constructor(message: string, diff: Diff) {
    super(message);

    this.diff = diff.toJSON();

    Object.setPrototypeOf(this, NoMatchingActionFoundTransactionError.prototype);
  }
}

export class ValidationTransactionError extends TransactionError {
  errors: ReturnType<ValidationService['validate']>;

  constructor(message: string, errors: ReturnType<ValidationService['validate']>) {
    super(message);

    this.errors = errors;

    Object.setPrototypeOf(this, ValidationTransactionError.prototype);
  }
}
