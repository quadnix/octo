import type { IUnknownModelAction, UnknownResource } from '../app.type.js';
import type { Diff } from '../functions/diff/diff.js';
import type { ValidationService } from '../services/validation/validation.service.js';

/**
 * Parent error class for all transaction errors.
 *
 * @group Errors/Transaction
 */
export class TransactionError extends Error {
  /**
   * @param message The error message.
   */
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}

/**
 * Thrown when a run tries to change resources that a previous run left in an unsettled state. Commit or resolve those first.
 *
 * @group Errors/Transaction
 */
export class DiffsOnDirtyResourcesTransactionError extends TransactionError {
  readonly diffs: ReturnType<Diff['toJSON']>[];
  readonly dirtyResources: UnknownResource[];

  /**
   * @param message The error message.
   * @param diffs The diffs the run was trying to apply.
   * @param dirtyResources The resources left unsettled by an earlier run.
   */
  constructor(message: string, diffs: Diff[], dirtyResources: UnknownResource[]) {
    super(message);

    this.diffs = diffs.map((d) => d.toJSON());
    this.dirtyResources = dirtyResources.map((r) => r.synth());

    Object.setPrototypeOf(this, DiffsOnDirtyResourcesTransactionError.prototype);
  }
}

/**
 * Thrown when an action asks for an input its module never received.
 *
 * @group Errors/Transaction
 */
export class InputNotFoundTransactionError extends TransactionError {
  readonly action: string;
  readonly diff: ReturnType<Diff['toJSON']>;
  readonly key: string;

  /**
   * @param message The error message.
   * @param action The action asking for the input.
   * @param diff The diff it was handling.
   * @param key The input key that was not found.
   */
  constructor(message: string, action: IUnknownModelAction, diff: Diff, key: string) {
    super(message);

    this.action = action.constructor.name;
    this.diff = diff.toJSON();
    this.key = key;

    Object.setPrototypeOf(this, InputNotFoundTransactionError.prototype);
  }
}

/**
 * Thrown when a model action itself throws. Carries the action and the diff it was handling.
 *
 * @group Errors/Transaction
 */
export class ModelActionExceptionTransactionError extends TransactionError {
  readonly actionClassName: string;
  readonly diff: ReturnType<Diff['toJSON']>;

  /**
   * @param message The error message.
   * @param diff The diff the action was handling.
   * @param actionClassName The action that failed.
   */
  constructor(message: string, diff: Diff, actionClassName: string) {
    super(message);

    this.actionClassName = actionClassName;
    this.diff = diff.toJSON();

    Object.setPrototypeOf(this, ModelActionExceptionTransactionError.prototype);
  }
}

/**
 * Thrown when a diff is produced that no registered action accepts - usually a missing `@Action`, or a `filter()` that is too narrow.
 *
 * @group Errors/Transaction
 */
export class NoMatchingActionFoundTransactionError extends TransactionError {
  readonly diff: ReturnType<Diff['toJSON']>;

  /**
   * @param message The error message.
   * @param diff The diff no action accepted.
   */
  constructor(message: string, diff: Diff) {
    super(message);

    this.diff = diff.toJSON();

    Object.setPrototypeOf(this, NoMatchingActionFoundTransactionError.prototype);
  }
}

/**
 * Thrown when an overlay action itself throws. Carries the action and the diff it was handling.
 *
 * @group Errors/Transaction
 */
export class OverlayActionExceptionTransactionError extends TransactionError {
  readonly actionClassName: string;
  readonly diff: ReturnType<Diff['toJSON']>;

  /**
   * @param message The error message.
   * @param diff The diff the action was handling.
   * @param actionClassName The action that failed.
   */
  constructor(message: string, diff: Diff, actionClassName: string) {
    super(message);

    this.actionClassName = actionClassName;
    this.diff = diff.toJSON();

    Object.setPrototypeOf(this, OverlayActionExceptionTransactionError.prototype);
  }
}

/**
 * Thrown when a resource action itself throws. Carries the action and the diff it was handling, and chains the original error's stack.
 *
 * @group Errors/Transaction
 */
export class ResourceActionExceptionTransactionError extends TransactionError {
  readonly actionClassName: string;
  readonly diff: ReturnType<Diff['toJSON']>;

  /**
   * @param message The error message.
   * @param originalError The error the action threw, whose stack is chained onto this one.
   * @param diff The diff it was handling.
   * @param actionClassName The action that threw.
   */
  constructor(message: string, originalError: Error, diff: Diff, actionClassName: string) {
    super(message);

    this.actionClassName = actionClassName;
    this.diff = diff.toJSON();

    Object.setPrototypeOf(this, ResourceActionExceptionTransactionError.prototype);
    if (originalError?.stack) {
      this.stack = `${this.stack}\n\nCaused by: ${originalError.stack}`;
    }
  }
}

/**
 * Thrown when a resource action outruns its {@link IResourceAction.actionTimeoutInMs}.
 *
 * @group Errors/Transaction
 */
export class ResourceActionTimeoutTransactionError extends TransactionError {
  readonly actionClassName: string;
  readonly diff: ReturnType<Diff['toJSON']>;

  /**
   * @param message The error message.
   * @param diff The diff the action was handling.
   * @param actionClassName The action that failed.
   */
  constructor(message: string, diff: Diff, actionClassName: string) {
    super(message);

    this.actionClassName = actionClassName;
    this.diff = diff.toJSON();

    Object.setPrototypeOf(this, ResourceActionTimeoutTransactionError.prototype);
  }
}

/**
 * Thrown when a value fails a {@link Validate} constraint. Carries every constraint that failed.
 *
 * @group Errors/Transaction
 */
export class ValidationTransactionError extends TransactionError {
  errors: ReturnType<ValidationService['validate']>;

  /**
   * @param message The error message.
   * @param errors Every constraint that failed.
   */
  constructor(message: string, errors: ReturnType<ValidationService['validate']>) {
    super(message);

    this.errors = errors;

    Object.setPrototypeOf(this, ValidationTransactionError.prototype);
  }
}
