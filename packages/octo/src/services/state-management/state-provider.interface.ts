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
   * Deletes a state file. Deleting one that is not there is not an error.
   */
  deleteState(stateFileName: string): Promise<void>;

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
   * Takes the app lock and returns its id, which `apply` and `commit` must then present.
   *
   * The lock is taken atomically, so of two callers racing for it exactly one wins.
   *
   * @throws {@link TransactionError} With the message `App already locked!` when one is held.
   */
  lockApp(): Promise<{ lockId: string }>;

  /**
   * Writes a state file, overwriting whatever was there.
   */
  saveState(stateFileName: string, data: Buffer): Promise<void>;

  /**
   * Releases the app lock. Unlocking an app that is not locked is not an error.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a different lock is
   * held, so one run can never release another's.
   */
  unlockApp(lockId: string): Promise<void>;
}
