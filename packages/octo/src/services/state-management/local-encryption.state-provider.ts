import { readdir, rm } from 'fs/promises';
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
   * @throws {@link TransactionError} When the state cannot be decrypted with the configured key.
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
      // AES-GCM authenticates the data it reads back, so a wrong key fails here rather than
      // returning nonsense. Node reports that as "unable to authenticate data", which reads as
      // corruption; by far the likelier cause is that the key this run was given is not the key
      // the state was written with.
      if (error instanceof Error && /unable to authenticate data|Unsupported state/i.test(error.message)) {
        throw new TransactionError(
          `State "${stateFileName}" could not be decrypted. The encryption key does not match the ` +
            'one this state was written with.',
        );
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
   * The names of the state files whose name starts with `prefix`, with the `.enc` suffix removed so
   * a caller can read them back by the name it knows.
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

    return entries
      .filter((entry) => entry.endsWith('.enc') && entry.startsWith(prefix))
      .map((entry) => entry.slice(0, -'.enc'.length));
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
  async refreshState(): Promise<void> {
    return;
  }

  /**
   * Writes state files, overwriting whatever was there and deleting each one given no `data`.
   */
  async saveStates(stateFiles: { data: Buffer | undefined; stateFileName: string }[]): Promise<void> {
    await FileUtility.ensureDirectory(this.localStateDirectoryPath);

    for (const { data, stateFileName } of stateFiles) {
      if (data === undefined) {
        await rm(join(this.localStateDirectoryPath, stateFileName + '.enc'), { force: true });
      } else {
        await FileUtility.encryptBufferToFile(
          data,
          join(this.localStateDirectoryPath, stateFileName + '.enc'),
          this.encryptionKey,
        );
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
