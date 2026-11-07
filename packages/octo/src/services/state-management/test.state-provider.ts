import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppLockError, TransactionError } from '../../errors/index.js';
import { type IStateProvider, JOURNAL_STATE_FILE_NAME_PREFIX } from './state-provider.interface.js';

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
   * The id of the lock currently held, or `undefined` when the app is unlocked.
   */
  async getAppLock(): Promise<string | undefined> {
    return this.lockId;
  }

  /**
   * Reads a state file. Nothing is sealed here, so the state itself stands in for the sealed state.
   *
   * @throws {@link TransactionError} With the message `No state found!` when the file does not exist.
   */
  async getSealedState(stateFileName: string): Promise<Buffer> {
    return this.getState(stateFileName);
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
   * A new path in the system's temporary directory, since the state holds no files.
   */
  async getTemporaryFilePath(name: string): Promise<string> {
    return join(tmpdir(), `octo-test-state-${name}-${randomUUID()}.tmp`);
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
  async lockApp(lock: Parameters<IStateProvider['lockApp']>[0]): ReturnType<IStateProvider['lockApp']> {
    if ('lockId' in lock) {
      if (this.lockId !== lock.lockId) {
        throw new AppLockError(`App is not locked with lock ID "${lock.lockId}"!`, { reason: 'not-held' });
      }
      return { lockId: lock.lockId };
    }
    if (this.lockId) {
      throw new AppLockError(`App already locked with lock ID "${this.lockId}"!`, {
        holder: { lockId: this.lockId },
        reason: 'held',
      });
    }
    this.lockId = randomUUID();

    return { lockId: this.lockId };
  }

  /**
   * Does nothing: the state lives in this process alone, so it is always the newest.
   */
  async refreshState(): Promise<{ replaced: boolean }> {
    return { replaced: false };
  }

  /**
   * Writes state files, overwriting whatever was there, moving each one given a `filePath` into memory,
   * and deleting each one given no `data`.
   */
  async saveStates(stateFiles: Parameters<IStateProvider['saveStates']>[0]): Promise<void> {
    for (const stateFile of stateFiles) {
      if ('filePath' in stateFile) {
        this.localState[stateFile.stateFileName] = await readFile(stateFile.filePath);
        await rm(stateFile.filePath, { force: true });
      } else if (stateFile.data === undefined) {
        delete this.localState[stateFile.stateFileName];
      } else {
        this.localState[stateFile.stateFileName] = stateFile.data;
      }
    }
  }

  /**
   * Clears the journal, which a run that follows would refuse to lock over, and releases the app lock.
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

    for (const stateFileName of await this.listStates(JOURNAL_STATE_FILE_NAME_PREFIX)) {
      delete this.localState[stateFileName];
    }

    this.lockId = undefined;
  }
}
