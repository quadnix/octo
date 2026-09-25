import { randomUUID } from 'node:crypto';
import { TransactionError } from '../../errors/index.js';
import type { IStateProvider } from './state-provider.interface.js';

/**
 * Keeps state in memory, and discards it when the process ends. For tests.
 *
 * @group Services/State Management
 *
 * @see Techniques for [State Providers](/docs/techniques/state-providers).
 */
export class TestStateProvider implements IStateProvider {
  private readonly localState: { [key: string]: Buffer } = {};

  private lockId: string | undefined = undefined;

  /**
   * Deletes a state file. Deleting one that is not there is not an error.
   */
  async deleteState(stateFileName: string): Promise<void> {
    delete this.localState[stateFileName];
  }

  /**
   * The id of the lock currently held, or `undefined` when the app is unlocked.
   */
  async getAppLock(): Promise<string | undefined> {
    return this.lockId;
  }

  /**
   * Reads a state file.
   *
   * @throws {@link TransactionError} With the message `No state found!` when the file does not exist.
   */
  async getState(stateFileName: string): Promise<Buffer> {
    if (!(stateFileName in this.localState)) {
      throw new TransactionError('No state found!');
    }
    return this.localState[stateFileName];
  }

  /**
   * Whether `lockId` is the lock currently held.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a different lock is held.
   */
  async isAppLocked(lockId: string): Promise<boolean> {
    if (!this.lockId) {
      return false;
    }
    if (this.lockId !== lockId) {
      throw new TransactionError('Invalid lock ID!');
    }

    return true;
  }

  /**
   * The names of the state files whose name starts with `prefix`.
   */
  async listStates(prefix: string): Promise<string[]> {
    return Object.keys(this.localState).filter((stateFileName) => stateFileName.startsWith(prefix));
  }

  /**
   * Takes the app lock. With `lockId`, resumes the run already holding it.
   *
   * @throws {@link TransactionError} When a lock is held, naming the id that holds it. When `lockId`
   * is given and is not the lock held.
   */
  async lockApp(lockId?: string): Promise<{ lockId: string }> {
    if (lockId) {
      if (this.lockId !== lockId) {
        throw new TransactionError(`App is not locked with lock ID "${lockId}"!`);
      }
      return { lockId };
    }
    if (this.lockId) {
      throw new TransactionError(`App already locked with lock ID "${this.lockId}"!`);
    }
    this.lockId = randomUUID();

    return { lockId: this.lockId };
  }

  /**
   * Does nothing: the state lives in this process alone, so it is always the newest.
   */
  async refreshState(): Promise<void> {
    return;
  }

  /**
   * Writes a state file, overwriting whatever was there.
   */
  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    this.localState[stateFileName] = data;
  }

  /**
   * Releases the app lock.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a different lock is held.
   */
  async unlockApp(lockId: string): Promise<void> {
    if (!this.lockId) {
      return;
    }
    if (this.lockId !== lockId) {
      throw new TransactionError('Invalid lock ID!');
    }
    this.lockId = undefined;
  }
}
