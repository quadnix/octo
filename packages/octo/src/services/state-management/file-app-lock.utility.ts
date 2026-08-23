import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { TransactionError } from '../../errors/index.js';

/**
 * The app lock, kept as a file on disk. Shared by the state providers that keep state in a directory.
 *
 * The lock is taken with an exclusive create, which the filesystem resolves atomically: of two
 * processes racing for the same path, exactly one succeeds. Reading first and writing second would
 * let both believe they hold it.
 *
 * @internal
 */
export class FileAppLockUtility {
  /**
   * @internal
   */
  static async getAppLock(lockFilePath: string): Promise<string | undefined> {
    try {
      const lockId = (await readFile(lockFilePath, 'utf-8')).trim();
      return lockId || undefined;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
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
  static async lockApp(lockFilePath: string): Promise<{ lockId: string }> {
    const lockId = randomUUID();

    try {
      await writeFile(lockFilePath, lockId, { flag: 'wx' });
    } catch (error) {
      if (error.code === 'EEXIST') {
        // The holder's id is read back and reported, so a blocked run can be told what to break
        // without a separate command to ask.
        throw new TransactionError(`App already locked with lock ID "${await this.getAppLock(lockFilePath)}"!`);
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
}
