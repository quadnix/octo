import { randomUUID } from 'crypto';
import { copyFile, readFile, readdir, rename, rm, writeFile } from 'fs/promises';
import { basename, dirname, extname, join, resolve } from 'path';
import { AppLockError, TransactionError } from '../../errors/index.js';
import { FileUtility } from '../../utilities/file/file.utility.js';
import {
  type IStateProvider,
  JOURNAL_STATE_FILE_NAME_PREFIX,
  STATE_FILE_EXTENSIONS,
} from './state-provider.interface.js';

const ARCHIVE_DIRECTORY_NAME = 'archives';
const ARCHIVE_NAME_PATTERN = /^(\d{13,})-/;
const SEALING_PREFIX = '.sealing-';
const TEMPORARY_FILE_EXTENSION = '.tmp';
const TEMPORARY_FILE_NAME_MAX_LENGTH = 100;

/**
 * What the lock file holds: the id that proves ownership, the commit the run seals as, and when it
 * was taken.
 */
interface AppLockRecord {
  commitId: string;
  lockId: string;
  startedAt: number;
}

/**
 * Keeps state in a directory on the local filesystem.
 *
 * Good for experimenting on your own machine. It is not shared, so a team running Octo against the
 * same infrastructure needs a provider that persists somewhere they all reach.
 *
 * Releasing the lock seals the run into `archives/<commitId>/`, the newest of which is the
 * sealed state. Deleting old archives is up to you.
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
   * Seals the state into `archives/<commitId>/`: every state file is copied there, and every journal
   * file moved. The archive is built as `archives/.sealing-<commitId>/` and renamed when whole, so a
   * reader never finds half of one. Sealing a commit again adds to its archive. Temporary files a
   * killed process left are deleted.
   *
   * @internal
   */
  async archiveState(commitId: string): Promise<void> {
    const fileNames = (await readdir(this.localStateDirectoryPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    const stateFileNames = fileNames.filter((n) => !n.startsWith('.') && STATE_FILE_EXTENSIONS.includes(extname(n)));
    const archivePath = join(this.localStateDirectoryPath, ARCHIVE_DIRECTORY_NAME, commitId);
    const sealingPath = join(this.localStateDirectoryPath, ARCHIVE_DIRECTORY_NAME, `${SEALING_PREFIX}${commitId}`);

    // Build the archive under its temporary name, starting from any archive of this commit.
    await FileUtility.ensureDirectory(dirname(archivePath));
    try {
      await rename(archivePath, sealingPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    await FileUtility.ensureDirectory(sealingPath);
    for (const stateFileName of stateFileNames) {
      await copyFile(join(this.localStateDirectoryPath, stateFileName), join(sealingPath, stateFileName));
    }

    // Seal it.
    await rename(sealingPath, archivePath);

    // Remove what the archive now holds, and what no process is still writing.
    const removedFileNames = [
      ...stateFileNames.filter((n) => n.startsWith(JOURNAL_STATE_FILE_NAME_PREFIX)),
      ...fileNames.filter((n) => n.startsWith('.') && n.endsWith(TEMPORARY_FILE_EXTENSION)),
    ];
    for (const removedFileName of removedFileNames) {
      await rm(join(this.localStateDirectoryPath, removedFileName), { force: true });
    }
  }

  /**
   * The id of the lock currently held, or `undefined` when the app is unlocked.
   */
  async getAppLock(): Promise<string | undefined> {
    return (await this.readLock())?.lockId;
  }

  /**
   * Reads state files from the newest archive, found by the time at the start of its commit id. Only
   * one lock is held at a time, so the last lock taken is the last run sealed.
   */
  async getSealedStates(stateFileNames: string[]): Promise<(Buffer | undefined)[]> {
    const [newestArchive] = await this.listArchives();
    if (!newestArchive) {
      return stateFileNames.map(() => undefined);
    }

    return this.readStates(stateFileNames.map((n) => join(ARCHIVE_DIRECTORY_NAME, newestArchive.name, n)));
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
   * A new path beside the state files, named `.<name>.<random>.tmp`.
   */
  async getTemporaryFilePath(name: string): Promise<string> {
    await FileUtility.ensureDirectory(this.localStateDirectoryPath);
    return this.temporaryFilePathFor(join(this.localStateDirectoryPath, name));
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
   * Takes the app lock, writing its id, its commit and the time it was taken into `local-state.lock`
   * beside the state files. With `lockId`, resumes the run already holding it. The lock never expires.
   *
   * @throws {@link AppLockError} When a lock is held, naming the id that holds it and how long it has
   * been held. When `lockId` is given and is not the lock held.
   */
  async lockApp(lock: Parameters<IStateProvider['lockApp']>[0]): Promise<{ commitId: string; lockId: string }> {
    await FileUtility.ensureDirectory(this.localStateDirectoryPath);

    // Resume the run holding the lock, which on one machine holds nothing more to read.
    if ('lockId' in lock) {
      const held = await this.readLock();
      if (held?.lockId !== lock.lockId) {
        throw new AppLockError(`App is not locked with lock ID "${lock.lockId}"!`, { reason: 'not-held' });
      }
      return { commitId: held.commitId, lockId: held.lockId };
    }

    // Take the lock with an exclusive create, so of two runs racing for it exactly one wins.
    const newLockId = randomUUID();
    const record: AppLockRecord = { commitId: lock.commitId, lockId: newLockId, startedAt: Date.now() };
    try {
      await writeFile(this.lockFilePath, JSON.stringify(record), { flag: 'wx' });
    } catch (error) {
      if (error.code === 'EEXIST') {
        const holder = await this.readLock();
        const heldFor = holder && this.describeAge(holder.startedAt);
        throw new AppLockError(
          `App already locked with lock ID "${holder?.lockId}"${heldFor ? `, held for ${heldFor}` : ''}!`,
          {
            holder: holder ? { lockId: holder.lockId, takenAt: holder.startedAt } : undefined,
            reason: 'held',
          },
        );
      }
      throw error;
    }

    return { commitId: lock.commitId, lockId: newLockId };
  }

  /**
   * Reads state files, `undefined` for one that does not exist.
   *
   * @internal
   */
  async readStates(stateFileNames: string[]): Promise<(Buffer | undefined)[]> {
    return Promise.all(
      stateFileNames.map((stateFileName) =>
        this.getState(stateFileName).catch((error) => {
          if (error.message === 'No state found!') {
            return undefined;
          }
          throw error;
        }),
      ),
    );
  }

  /**
   * Does nothing: the directory is the only copy of the state, so it is always the newest.
   */
  async refreshState(): Promise<{ replaced: boolean }> {
    return { replaced: false };
  }

  /**
   * Writes state files, overwriting whatever was there, moving each one given a `filePath`, and
   * deleting each one given no `data`.
   *
   * Each file is written under a temporary name and renamed into place, so a process killed mid-write
   * leaves the file whole, and a reader holding it through a hard link keeps what it holds.
   */
  async saveStates(stateFiles: Parameters<IStateProvider['saveStates']>[0]): Promise<void> {
    for (const stateFile of stateFiles) {
      const stateFilePath = join(this.localStateDirectoryPath, stateFile.stateFileName);

      if ('filePath' in stateFile) {
        await FileUtility.ensureDirectory(dirname(stateFilePath));
        await rename(stateFile.filePath, stateFilePath);
      } else if (stateFile.data === undefined) {
        await rm(stateFilePath, { force: true });
      } else {
        await FileUtility.ensureDirectory(dirname(stateFilePath));
        const temporaryFilePath = this.temporaryFilePathFor(stateFilePath);
        await writeFile(temporaryFilePath, stateFile.data);
        await rename(temporaryFilePath, stateFilePath);
      }
    }
  }

  /**
   * Seals the run with {@link LocalStateProvider.archiveState}, then releases the app lock by deleting
   * the lock file. A run that cannot be archived keeps the lock held.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a different lock is held.
   */
  async unlockApp(lockId: string): Promise<void> {
    const held = await this.readLock();

    if (!held) {
      return;
    }
    if (held.lockId !== lockId) {
      throw new TransactionError('Invalid lock ID!');
    }

    await this.archiveState(held.commitId);
    await rm(this.lockFilePath, { force: true });
  }

  /**
   * How long the lock has been held, as a short readable span. Undefined when the recorded time
   * cannot be read as one, so a broken value is left out rather than reported as a negative age.
   */
  private describeAge(startedAt: number): string | undefined {
    const heldForMs = Date.now() - startedAt;
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
   * Every archive, newest first, by the time at the start of its commit id.
   */
  private async listArchives(): Promise<{ name: string; takenAt: number }[]> {
    let names: string[];
    try {
      names = await readdir(join(this.localStateDirectoryPath, ARCHIVE_DIRECTORY_NAME));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    return names
      .map((name) => ({ name, takenAt: Number(ARCHIVE_NAME_PATTERN.exec(name)?.[1]) }))
      .filter(({ takenAt }) => Number.isSafeInteger(takenAt))
      .sort((a, b) => b.takenAt - a.takenAt);
  }

  /**
   * The lock file's record, or undefined when no lock is held.
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
    return JSON.parse(contents) as AppLockRecord;
  }

  /**
   * A new temporary path in the directory of `filePath`, which no state listing finds.
   */
  private temporaryFilePathFor(filePath: string): string {
    const name = basename(filePath).slice(0, TEMPORARY_FILE_NAME_MAX_LENGTH);
    return join(dirname(filePath), `.${name}.${randomUUID()}${TEMPORARY_FILE_EXTENSION}`);
  }
}
