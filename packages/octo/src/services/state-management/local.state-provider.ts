import { readFile, readdir, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { TransactionError } from '../../errors/index.js';
import { FileUtility } from '../../utilities/file/file.utility.js';
import { FileAppLockUtility } from '../../utilities/file-app-lock/file-app-lock.utility.js';
import type { IStateProvider } from './state-provider.interface.js';

/**
 * Keeps state in a directory on the local filesystem.
 *
 * Good for experimenting on your own machine. It is not shared, so a team running Octo against the
 * same infrastructure needs a provider that persists somewhere they all reach.
 *
 * @example
 * ```ts
 * await octo.initialize(new LocalStateProvider('./infrastructure'));
 * ```
 *
 * @group Services/State Management
 *
 * @see Techniques for [State Providers](/docs/techniques/state-providers).
 */
export class LocalStateProvider implements IStateProvider {
  private readonly localStateDirectoryPath: string;

  private readonly lockFilePath: string;

  /**
   * @param localStateDirectoryPath The directory state files are written into.
   */
  constructor(localStateDirectoryPath: string) {
    this.localStateDirectoryPath = resolve(localStateDirectoryPath);
    this.lockFilePath = join(this.localStateDirectoryPath, 'local-state.lock');
  }

  /**
   * The id of the lock currently held, or `undefined` when the app is unlocked.
   */
  async getAppLock(): Promise<string | undefined> {
    return FileAppLockUtility.getAppLock(this.lockFilePath);
  }

  /**
   * Reads a state file.
   *
   * @throws {@link TransactionError} With the message `No state found!` when the file does not exist.
   */
  async getState(stateFileName: string): Promise<Buffer> {
    try {
      return await readFile(join(this.localStateDirectoryPath, stateFileName));
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new TransactionError('No state found!');
      }
      throw error;
    }
  }

  /**
   * Whether `lockId` is the lock currently held.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a different lock is held.
   */
  async isAppLocked(lockId: string): Promise<boolean> {
    return FileAppLockUtility.isAppLocked(this.lockFilePath, lockId);
  }

  /**
   * The names of the state files whose name starts with `prefix`.
   */
  async listStates(prefix: string): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(this.localStateDirectoryPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    return entries.filter((entry) => entry.startsWith(prefix));
  }

  /**
   * Takes the app lock, writing its id into `local-state.lock` beside the state files. With
   * `lockId`, resumes the run already holding it.
   *
   * @throws {@link TransactionError} When a lock is held, naming the id that holds it. When `lockId`
   * is given and is not the lock held.
   */
  async lockApp(lockId?: string): Promise<{ lockId: string }> {
    await FileUtility.ensureDirectory(this.localStateDirectoryPath);
    return FileAppLockUtility.lockApp(this.lockFilePath, lockId);
  }

  /**
   * Does nothing: the directory is the only copy of the state, so it is always the newest.
   */
  async refreshState(): Promise<{ replaced: boolean }> {
    return { replaced: false };
  }

  /**
   * Writes state files, overwriting whatever was there and deleting each one given no `data`. A name
   * holding `/` is written into a directory beneath the state directory.
   */
  async saveStates(stateFiles: { data: Buffer | undefined; stateFileName: string }[]): Promise<void> {
    for (const { data, stateFileName } of stateFiles) {
      const stateFilePath = join(this.localStateDirectoryPath, stateFileName);
      if (data === undefined) {
        await rm(stateFilePath, { force: true });
      } else {
        await FileUtility.ensureDirectory(dirname(stateFilePath));
        await writeFile(stateFilePath, data);
      }
    }
  }

  /**
   * Releases the app lock by deleting the lock file.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a different lock is held.
   */
  async unlockApp(lockId: string): Promise<void> {
    return FileAppLockUtility.unlockApp(this.lockFilePath, lockId);
  }
}
