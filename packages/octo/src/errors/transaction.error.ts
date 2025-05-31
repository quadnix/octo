import type { IUnknownModelAction, UnknownResource } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';
import type { ValidationService } from '../services/validation/validation.service.js';

export class TransactionError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}

export class DiffsOnDirtyResourcesTransactionError extends TransactionError {
  readonly diffs: ReturnType<Diff['toJSON']>[];
  readonly dirtyResources: UnknownResource[];

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

  constructor(message: string, action: IUnknownModelAction, diff: Diff, key: string) {
    super(message);

    this.action = action.constructor.name;
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

export class ResourceActionExceptionTransactionError extends TransactionError {
  readonly actionClassName: string;
  readonly diff: ReturnType<Diff['toJSON']>;

  constructor(message: string, originalError: Error, diff: Diff, actionClassName: string) {
    super(message);

    this.actionClassName = actionClassName;
    this.diff = diff.toJSON();

    Object.setPrototypeOf(this, ResourceActionExceptionTransactionError.prototype);

    Object.defineProperties(this, Object.getOwnPropertyDescriptors(originalError));
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ResourceActionTimeoutTransactionError extends TransactionError {
  readonly actionClassName: string;
  readonly diff: ReturnType<Diff['toJSON']>;

  constructor(message: string, diff: Diff, actionClassName: string) {
    super(message);

    this.actionClassName = actionClassName;
    this.diff = diff.toJSON();

    Object.setPrototypeOf(this, ResourceActionTimeoutTransactionError.prototype);
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
