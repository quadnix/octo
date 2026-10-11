import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { AppLockError, TransactionError } from '../../errors/index.js';

/**
 * What the lock file holds: the id that proves ownership, and when it was taken.
 */
interface AppLockRecord {
  lockId: string;
  startedAt?: string;
}

/**
 * The app lock, kept as a file on disk. Shared by the state providers that keep state in a directory.
 *
 * The lock is taken with an exclusive create, which the filesystem resolves atomically: of two
 * processes racing for the same path, exactly one succeeds. Reading first and writing second would
 * let both believe they hold it.
 *
 * The lock never expires, so a run that died holding one leaves it held until a person finishes that
 * run through its lock id. That decision turns on whether the holder is still working, so the record
 * carries the time it was taken and a blocked run is told how long it has been held.
 *
 * @internal
 */
export class FileAppLockUtility {
  /**
   * @internal
   */
  static async getAppLock(lockFilePath: string): Promise<string | undefined> {
    return (await this.readLock(lockFilePath))?.lockId;
  }

  /**
   * @internal
   */
  static async isAppLocked(lockFilePath: string, lockId: string): Promise<boolean> {
    const existingLockId = await this.getAppLock(lockFilePath);

    if (!existingLockId) {
      return false;
    }
    if (existingLockId !== lockId) {
      throw new TransactionError('Invalid lock ID!');
    }

    return true;
  }

  /**
   * @internal
   */
  static async lockApp(lockFilePath: string, resumeLockId?: string): Promise<{ lockId: string }> {
    // Resume the run holding the lock, which on one machine holds nothing more to read.
    if (resumeLockId) {
      if ((await this.getAppLock(lockFilePath)) !== resumeLockId) {
        throw new AppLockError(`App is not locked with lock ID "${resumeLockId}"!`, { reason: 'not-held' });
      }
      return { lockId: resumeLockId };
    }

    const lockId = randomUUID();
    const record: AppLockRecord = { lockId, startedAt: new Date().toISOString() };

    try {
      await writeFile(lockFilePath, JSON.stringify(record), { flag: 'wx' });
    } catch (error) {
      if (error.code === 'EEXIST') {
        // The holder is read back and reported, so a blocked run can be told what it waits on without a
        // separate command to ask, and how long it has been held without one either.
        const holder = await this.readLock(lockFilePath);
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

    return { lockId };
  }

  /**
   * @internal
   */
  static async unlockApp(lockFilePath: string, lockId: string): Promise<void> {
    const existingLockId = await this.getAppLock(lockFilePath);

    if (!existingLockId) {
      return;
    }
    if (existingLockId !== lockId) {
      throw new TransactionError('Invalid lock ID!');
    }

    await rm(lockFilePath, { force: true });
  }

  /**
   * How long the lock has been held, as a short readable span. Undefined when the recorded time
   * cannot be read as one, so a broken value is left out rather than reported as a negative age.
   */
  private static describeAge(startedAt: string): string | undefined {
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
  private static async readLock(lockFilePath: string): Promise<AppLockRecord | undefined> {
    let contents: string;
    try {
      contents = (await readFile(lockFilePath, 'utf-8')).trim();
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
