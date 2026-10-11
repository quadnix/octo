/**
 * The prefix of the state files the journal writes. A remote state provider uploads them while the
 * lock is held, and never replaces them when it refreshes.
 *
 * @internal
 */
export const JOURNAL_STATE_FILE_NAME_PREFIX = 'journal.';

/**
 * The commands that run before a lock. Every other command runs under one, and its journal files
 * belong to the lock held.
 *
 * @internal
 */
export const JOURNAL_COMMANDS_BEFORE_LOCK = ['generate', 'lock', 'validate'];

/**
 * Where Octo's state files live.
 *
 * Octo has no database - it records what it built in state files, and reads them back on the next run
 * to work out the diff. A state provider is only asked to put a named blob somewhere and hand it back
 * later, so implementing this interface is all it takes to keep state in S3, a database, or anywhere
 * else your team already trusts.
 *
 * Pass one to {@link Octo.initialize}.
 *
 * @group Services/State Management
 *
 * @see Techniques for [State Providers](/docs/techniques/state-providers).
 */
export interface IStateProvider {
  /**
   * The id of the lock currently held, or `undefined` when the app is unlocked.
   */
  getAppLock(): Promise<string | undefined>;

  /**
   * Reads a state file.
   *
   * @throws {@link TransactionError} With the message `No state found!` when the file does not exist.
   * Octo treats that as a first run rather than an error.
   */
  getState(stateFileName: string): Promise<Buffer>;

  /**
   * Whether `lockId` is the lock currently held.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a *different* lock is
   * held, so a caller holding a stale id is told it is stale rather than told the app is free.
   */
  isAppLocked(lockId: string): Promise<boolean>;

  /**
   * The names of the state files whose name starts with `prefix`, named as
   * {@link IStateProvider.getState} would be given them.
   *
   * Octo reads state by name everywhere else, so this is the only way it can discover a file it was
   * not told about - a record an interrupted run left behind. Returns an empty list when the store
   * holds nothing matching, including when it does not exist yet.
   */
  listStates(prefix: string): Promise<string[]>;

  /**
   * Takes the app lock and returns its id, which `apply` and `commit` must then present.
   *
   * The lock is taken atomically, so of two callers racing for it exactly one wins. With `lockId`,
   * resumes the run already holding that lock instead, which is how a run that died is finished.
   * `commitId` names the record the cycle writes into, where the provider keeps one.
   *
   * A provider sharing state names where a resume took the state directory from in `resumedFrom`:
   * `directory`, the directory the lock was taken in, left as it was; `run`, what the run uploaded so
   * far; `sealed`, the newest sealed state, because the run uploaded nothing.
   *
   * @throws {@link AppLockError} When a lock is held, naming the id that holds it. When `lockId` is
   * given and is not the lock held.
   */
  lockApp(
    lockId?: string,
  ): Promise<{ commitId?: string; lockId: string; resumedFrom?: 'directory' | 'run' | 'sealed' }>;

  /**
   * Brings the state up to the newest a run may plan against. `generate` calls it before reading any.
   *
   * A provider whose state is always the newest does nothing here, and returns `replaced: false`.
   * One that replaced the state files names the commit it replaced them with, and the one before.
   */
  refreshState(): Promise<{ commitId?: string; previousCommitId?: string; replaced: boolean }>;

  /**
   * Writes state files as one change, overwriting whatever was there and deleting each one given no
   * `data`. Deleting one that is not there is not an error. A name holding `/` is the machine's own:
   * a provider sharing state keeps it on the machine.
   *
   * A provider that pays per write makes one write of the whole change rather than one per file.
   */
  saveStates(stateFiles: { data: Buffer | undefined; stateFileName: string }[]): Promise<void>;

  /**
   * Releases the app lock. Unlocking an app that is not locked is not an error.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a different lock is
   * held, so one run can never release another's.
   */
  unlockApp(lockId: string): Promise<void>;
}
