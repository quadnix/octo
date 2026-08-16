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
   * Reads a state file.
   *
   * @throws {@link TransactionError} With the message `No state found!` when the file does not exist.
   * Octo treats that as a first run rather than an error.
   */
  getState(stateFileName: string): Promise<Buffer>;

  /**
   * Writes a state file, overwriting whatever was there.
   */
  saveState(stateFileName: string, data: Buffer): Promise<void>;
}
