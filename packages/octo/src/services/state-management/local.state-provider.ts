import { randomUUID } from 'crypto';
import { copyFile, readFile, readdir, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { AppLockError, TransactionError } from '../../errors/index.js';
import { FileUtility } from '../../utilities/file/file.utility.js';
import type { IStateProvider } from './state-provider.interface.js';

/**
 * What the lock file holds: the id that proves ownership, and when it was taken.
 */
interface AppLockRecord {
  lockId: string;
  startedAt?: string;
}

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
    return (await this.readLock())?.lockId;
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
    const existingLockId = await this.getAppLock();

    if (!existingLockId) {
      return false;
    }
    if (existingLockId !== lockId) {
      throw new TransactionError('Invalid lock ID!');
    }

    return true;
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
   * Takes the app lock, writing its id and the time it was taken into `local-state.lock` beside the
   * state files. With `lockId`, resumes the run already holding it. The lock never expires.
   *
   * @throws {@link AppLockError} When a lock is held, naming the id that holds it and how long it has
   * been held. When `lockId` is given and is not the lock held.
   */
  async lockApp(lockId?: string): Promise<{ lockId: string }> {
    await FileUtility.ensureDirectory(this.localStateDirectoryPath);

    // Resume the run holding the lock, which on one machine holds nothing more to read.
    if (lockId) {
      if ((await this.getAppLock()) !== lockId) {
        throw new AppLockError(`App is not locked with lock ID "${lockId}"!`, { reason: 'not-held' });
      }
      return { lockId };
    }

    // Take the lock with an exclusive create, so of two runs racing for it exactly one wins.
    const newLockId = randomUUID();
    const record: AppLockRecord = { lockId: newLockId, startedAt: new Date().toISOString() };
    try {
      await writeFile(this.lockFilePath, JSON.stringify(record), { flag: 'wx' });
    } catch (error) {
      if (error.code === 'EEXIST') {
        const holder = await this.readLock();
        const heldFor = holder?.startedAt ? this.describeAge(holder.startedAt) : undefined;
        throw new AppLockError(
          `App already locked with lock ID "${holder?.lockId}"${heldFor ? `, held for ${heldFor}` : ''}!`,
          {
            holder: holder
              ? { lockId: holder.lockId, takenAt: holder.startedAt ? Date.parse(holder.startedAt) : undefined }
              : undefined,
            reason: 'held',
          },
        );
      }
      throw error;
    }

    return { lockId: newLockId };
  }

  /**
   * Does nothing: the directory is the only copy of the state, so it is always the newest.
   */
  async refreshState(): Promise<{ replaced: boolean }> {
    return { replaced: false };
  }

  /**
   * Writes state files, overwriting whatever was there, copying each one given a `filePath`, and
   * deleting each one given no `data`. A name holding `/` is written into a directory beneath the state
   * directory.
   */
  async saveStates(stateFiles: Parameters<IStateProvider['saveStates']>[0]): Promise<void> {
    for (const stateFile of stateFiles) {
      const stateFilePath = join(this.localStateDirectoryPath, stateFile.stateFileName);
      if ('filePath' in stateFile) {
        await FileUtility.ensureDirectory(dirname(stateFilePath));
        await copyFile(stateFile.filePath, stateFilePath);
      } else if (stateFile.data === undefined) {
        await rm(stateFilePath, { force: true });
      } else {
        await FileUtility.ensureDirectory(dirname(stateFilePath));
        await writeFile(stateFilePath, stateFile.data);
      }
    }
  }

  /**
   * Releases the app lock by deleting the lock file.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a different lock is held.
   */
  async unlockApp(lockId: string): Promise<void> {
    const existingLockId = await this.getAppLock();

    if (!existingLockId) {
      return;
    }
    if (existingLockId !== lockId) {
      throw new TransactionError('Invalid lock ID!');
    }

    await rm(this.lockFilePath, { force: true });
  }

  /**
   * How long the lock has been held, as a short readable span. Undefined when the recorded time
   * cannot be read as one, so a broken value is left out rather than reported as a negative age.
   */
  private describeAge(startedAt: string): string | undefined {
    const heldForMs = Date.now() - Date.parse(startedAt);
    if (!Number.isFinite(heldForMs) || heldForMs < 0) {
      return undefined;
    }

    const seconds = Math.floor(heldForMs / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ${minutes % 60}m`;
    }

    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  }

  /**
   * The lock file's record, or undefined when no lock is held. A file holding an id and nothing else
   * is a lock taken before the record carried a time, and reads as that id with no age.
   */
  private async readLock(): Promise<AppLockRecord | undefined> {
    let contents: string;
    try {
      contents = (await readFile(this.lockFilePath, 'utf-8')).trim();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }

    if (!contents) {
      return undefined;
    }
    if (!contents.startsWith('{')) {
      return { lockId: contents };
    }

    try {
      const record = JSON.parse(contents) as Partial<AppLockRecord>;
      return typeof record.lockId === 'string' ? (record as AppLockRecord) : { lockId: contents };
    } catch (error) {
      return { lockId: contents };
    }
  }
}
