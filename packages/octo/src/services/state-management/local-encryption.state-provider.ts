import { rm } from 'fs/promises';
import { join, resolve } from 'path';
import { TransactionError } from '../../errors/index.js';
import { FileUtility } from '../../utilities/file/file.utility.js';
import { FileAppLockUtility } from './file-app-lock.utility.js';
import type { IStateProvider } from './state-provider.interface.js';

/**
 * Keeps state in a local directory, encrypted, with an `.enc` suffix.
 *
 * The point is that the resulting files are safe to commit to version control, which gives a small
 * team shared state without any infrastructure to run.
 *
 * @example
 * ```ts
 * await octo.initialize(new LocalEncryptionStateProvider('./infrastructure', process.env.OCTO_KEY!));
 * ```
 *
 * @group Services/State Management
 *
 * @see Techniques for [State Providers](/docs/techniques/state-providers).
 */
export class LocalEncryptionStateProvider implements IStateProvider {
  private readonly encryptionKey: string;

  private readonly localStateDirectoryPath: string;

  private readonly lockFilePath: string;

  /**
   * @param localStateDirectoryPath The directory state files are written into.
   * @param encryptionKey The key state is encrypted with. It must be at least 3 characters.
   * @throws {@link TransactionError} If the key is too weak.
   */
  constructor(localStateDirectoryPath: string, encryptionKey: string) {
    if (encryptionKey.length < 3) {
      throw new TransactionError('Selected encryption key is too weak!');
    }
    this.encryptionKey = encryptionKey;

    this.localStateDirectoryPath = resolve(localStateDirectoryPath);
    this.lockFilePath = join(this.localStateDirectoryPath, 'local-state.lock');
  }

  /**
   * Deletes a state file. Deleting one that is not there is not an error.
   */
  async deleteState(stateFileName: string): Promise<void> {
    await rm(join(this.localStateDirectoryPath, stateFileName + '.enc'), { force: true });
  }

  /**
   * The id of the lock currently held, or `undefined` when the app is unlocked. The lock file is not
   * encrypted - a lock id identifies a run, and reveals nothing about the state it guards.
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
      return await FileUtility.decryptFileToBuffer(
        join(this.localStateDirectoryPath, stateFileName + '.enc'),
        this.encryptionKey,
      );
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
   * Takes the app lock, writing its id into `local-state.lock` beside the state files.
   *
   * @throws {@link TransactionError} With the message `App already locked!` when one is held.
   */
  async lockApp(): Promise<{ lockId: string }> {
    return FileAppLockUtility.lockApp(this.lockFilePath);
  }

  /**
   * Writes a state file, overwriting whatever was there.
   */
  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    await FileUtility.encryptBufferToFile(
      data,
      join(this.localStateDirectoryPath, stateFileName + '.enc'),
      this.encryptionKey,
    );
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
