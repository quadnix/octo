import {
  ActionEvent,
  AppLockError,
  AppLockRefusedEvent,
  AppLockTakenEvent,
  AppUnlockingEvent,
  CommandFailedEvent,
  CommandFinishedEvent,
  CommandStartedEvent,
  CommitModeCompletedEvent,
  ContainerError,
  ContainerRegistrationError,
  ContainerResolutionError,
  ContextNodeError,
  DependencyError,
  DiffInverseResourceError,
  type DiffMetadata,
  DiffsOnDirtyResourcesTransactionError,
  InputError,
  InputNotFoundTransactionError,
  InputRegistrationError,
  InputResolutionError,
  ModeFailedEvent,
  ModeFinishedEvent,
  ModeStartedEvent,
  ModelActionExceptionTransactionError,
  ModelActionTransactionEvent,
  ModelDiffsTransactionEvent,
  ModelError,
  ModelTransactionTransactionEvent,
  ModuleError,
  ModuleEvent,
  NoMatchingActionFoundTransactionError,
  NodeError,
  NodeUnsynthError,
  OverlayActionExceptionTransactionError,
  OverlayError,
  PostCommitHookCallbackDoneEvent,
  PostModelActionHookCallbackDoneEvent,
  PostResourceActionHookCallbackDoneEvent,
  PreCommitHookCallbackDoneEvent,
  PreModelActionHookCallbackDoneEvent,
  PreResourceActionHookCallbackDoneEvent,
  RemoveResourceError,
  ResourceActionCompletedTransactionEvent,
  ResourceActionExceptionTransactionError,
  ResourceActionInitiatedTransactionEvent,
  ResourceActionSummaryTransactionEvent,
  ResourceActionTimeoutTransactionError,
  ResourceDiffsTransactionEvent,
  ResourceError,
  ResourceTransactionTransactionEvent,
  SchemaError,
  StateFilesSavedEvent,
  StateRefreshedEvent,
  TerraformCommandError,
  TerraformCommandFinishedEvent,
  TerraformCommandStartedEvent,
  TerraformFoldersWrittenEvent,
  TerraformProcessExitedEvent,
  TerraformProcessStartedEvent,
  TransactionError,
  ValidateModeCompletedEvent,
  ValidationTransactionError,
} from '@quadnix/octo';

/**
 * The fields of each octo error class a journal leaves out, because the journal holds them elsewhere.
 */
type OmittedErrorFields = {
  /**
   * What terraform printed is in the terraform log, under the process that ran `args`.
   */
  TerraformCommandError: 'stderr' | 'stdout';
};

/**
 * The fields an octo error of class `K` records beside its message.
 */
type ErrorFields<K extends keyof typeof JournalUtility.ERROR_CLASSES> = Omit<
  InstanceType<(typeof JournalUtility.ERROR_CLASSES)[K]>,
  keyof Error | (K extends keyof OmittedErrorFields ? OmittedErrorFields[K] : never)
>;

/**
 * An error a command or mode failed with, as its journal holds it. An octo error carries its class
 * name and the fields naming what it is about; any other error carries only its name and message.
 *
 * @group Event Listeners/Journal
 */
export type RecordedError =
  | {
      [K in keyof typeof JournalUtility.ERROR_CLASSES]: { className: K; message: string } & Plain<ErrorFields<K>>;
    }[keyof typeof JournalUtility.ERROR_CLASSES]
  | { className?: undefined; message: string; name: string };

/**
 * What {@link JournalUtility.toPlain} makes of a value of type `T`.
 *
 * @internal
 */
export type Plain<T> = T extends DiffMetadata
  ? Plain<ReturnType<T['toJSON']>> & { actions: string[]; applyOrder: T['applyOrder'] }
  : T extends Error
    ? RecordedError
    : T extends { getContext(): string }
      ? string
      : T extends Date
        ? number
        : T extends Uint8Array
          ? undefined
          : T extends bigint
            ? string
            : T extends string
              ? `${T}`
              : T extends ((...args: never[]) => unknown) | symbol
                ? undefined
                : T extends { toJSON(): infer J }
                  ? Plain<J>
                  : T extends Map<unknown, infer V>
                    ? { [key: string]: Plain<V> }
                    : T extends Set<infer V>
                      ? Plain<V>[]
                      : T extends object
                        ? { [K in keyof T]: Plain<T[K]> }
                        : T;

/**
 * Turns event payloads into plain data a journal can hold.
 *
 * @internal
 */
export class JournalUtility {
  /**
   * Each octo error class, by the class name its record carries. An error of any other class is
   * recorded by its name and message alone.
   *
   * @internal
   */
  static readonly ERROR_CLASSES = {
    AppLockError,
    ContainerError,
    ContainerRegistrationError,
    ContainerResolutionError,
    ContextNodeError,
    DependencyError,
    DiffInverseResourceError,
    DiffsOnDirtyResourcesTransactionError,
    InputError,
    InputNotFoundTransactionError,
    InputRegistrationError,
    InputResolutionError,
    ModelActionExceptionTransactionError,
    ModelError,
    ModuleError,
    NodeError,
    NodeUnsynthError,
    NoMatchingActionFoundTransactionError,
    OverlayActionExceptionTransactionError,
    OverlayError,
    RemoveResourceError,
    ResourceActionExceptionTransactionError,
    ResourceActionTimeoutTransactionError,
    ResourceError,
    SchemaError,
    TerraformCommandError,
    TransactionError,
    ValidationTransactionError,
  };

  /**
   * The class of each event a journal records, by the name its entries carry. An event of any other
   * class is not recorded.
   *
   * @internal
   */
  static readonly EVENT_CLASSES = {
    ActionEvent,
    AppLockRefusedEvent,
    AppLockTakenEvent,
    AppUnlockingEvent,
    CommandFailedEvent,
    CommandFinishedEvent,
    CommandStartedEvent,
    CommitModeCompletedEvent,
    ModeFailedEvent,
    ModeFinishedEvent,
    ModelActionTransactionEvent,
    ModelDiffsTransactionEvent,
    ModelTransactionTransactionEvent,
    ModeStartedEvent,
    ModuleEvent,
    PostCommitHookCallbackDoneEvent,
    PostModelActionHookCallbackDoneEvent,
    PostResourceActionHookCallbackDoneEvent,
    PreCommitHookCallbackDoneEvent,
    PreModelActionHookCallbackDoneEvent,
    PreResourceActionHookCallbackDoneEvent,
    ResourceActionCompletedTransactionEvent,
    ResourceActionInitiatedTransactionEvent,
    ResourceActionSummaryTransactionEvent,
    ResourceDiffsTransactionEvent,
    ResourceTransactionTransactionEvent,
    StateFilesSavedEvent,
    StateRefreshedEvent,
    TerraformCommandFinishedEvent,
    TerraformCommandStartedEvent,
    TerraformFoldersWrittenEvent,
    TerraformProcessExitedEvent,
    TerraformProcessStartedEvent,
    ValidateModeCompletedEvent,
  };

  /**
   * The fields of each octo error class a journal leaves out.
   */
  private static readonly OMITTED_ERROR_FIELDS: { [K in keyof OmittedErrorFields]: OmittedErrorFields[K][] } = {
    TerraformCommandError: ['stderr', 'stdout'],
  };

  /**
   * A copy of `value` holding only plain data. A node becomes its context, a diff its JSON with the
   * names of the actions chosen for it, an octo error its class name, message and fields, any other
   * error its name and message, and an object already on the path `'[Circular]'`. Bytes are dropped.
   *
   * @internal
   */
  static toPlain<T>(value: T): Plain<T> {
    return JournalUtility.toPlainOnPath(value, new Set()) as Plain<T>;
  }

  /**
   * {@link JournalUtility.toPlain}, for a value inside the objects on `path`.
   */
  private static toPlainOnPath(value: unknown, path: Set<object>): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'function' || typeof value === 'symbol') {
      return undefined;
    }
    if (typeof value !== 'object') {
      return value;
    }

    // Convert the kinds of object octo payloads carry.
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
      return undefined;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    if (value instanceof Error) {
      return JournalUtility.toRecordedError(value, path);
    }
    if (path.has(value)) {
      return '[Circular]';
    }

    path.add(value);
    try {
      const record = value as Record<string, unknown>;
      if (typeof record.getContext === 'function') {
        return (record.getContext as () => string)();
      }
      if ('actions' in record && 'applyOrder' in record && 'diff' in record && typeof record.toJSON === 'function') {
        return {
          ...(JournalUtility.toPlainOnPath((record.toJSON as () => unknown)(), path) as object),
          actions: (record.actions as object[]).map((a) => a.constructor.name),
          applyOrder: record.applyOrder,
        };
      }
      if (typeof record.toJSON === 'function') {
        return JournalUtility.toPlainOnPath((record.toJSON as () => unknown)(), path);
      }
      if (value instanceof Map) {
        return Object.fromEntries(
          [...value.entries()].map(([k, v]) => [String(k), JournalUtility.toPlainOnPath(v, path)]),
        );
      }
      if (value instanceof Set || Array.isArray(value)) {
        return [...value].map((v) => JournalUtility.toPlainOnPath(v, path));
      }

      const plain: Record<string, unknown> = {};
      for (const [key, entryValue] of Object.entries(record)) {
        plain[key] = JournalUtility.toPlainOnPath(entryValue, path);
      }
      return plain;
    } finally {
      path.delete(value);
    }
  }

  /**
   * An error as its journal holds it: an octo error by its class name, message and fields, any other
   * by its name and message.
   */
  private static toRecordedError(error: Error, path: Set<object>): RecordedError {
    const errorClass: unknown = error.constructor;
    const className = (Object.keys(JournalUtility.ERROR_CLASSES) as (keyof typeof JournalUtility.ERROR_CLASSES)[]).find(
      (name) => JournalUtility.ERROR_CLASSES[name] === errorClass,
    );
    if (!className) {
      return { message: error.message, name: error.name };
    }

    // Keep the fields the class names, but those the journal holds elsewhere.
    const omitted: string[] = (JournalUtility.OMITTED_ERROR_FIELDS as { [name: string]: string[] })[className] ?? [];
    const fields = Object.fromEntries(Object.entries(error).filter(([key]) => !omitted.includes(key)));
    return {
      ...(JournalUtility.toPlainOnPath(fields, path) as object),
      className,
      message: error.message,
    } as RecordedError;
  }
}
