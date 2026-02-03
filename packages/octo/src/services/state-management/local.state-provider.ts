import { readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { TransactionError } from '../../errors/index.js';
import type { IStateProvider } from './state-provider.interface.js';

/**
 * @group Services/State Management
 */
export class LocalStateProvider implements IStateProvider {
  private readonly localStateDirectoryPath: string;

  private readonly lockFilePath: string;

  constructor(localStateDirectoryPath: string) {
    this.localStateDirectoryPath = resolve(localStateDirectoryPath);

    this.lockFilePath = resolve(join(localStateDirectoryPath, 'local-state.lock'));
  }

  private async addOrUpdateAppLock(lockId: string): Promise<void> {
    await writeFile(this.lockFilePath, lockId);
  }

  async getAppLock(): Promise<string | undefined> {
    try {
      const contents = await readFile(this.lockFilePath, 'utf-8');
      const appLock = contents.replace(/\s/g, '');
      if (!appLock) {
        return undefined;
      }
      return appLock;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return undefined;
      } else {
        throw error;
      }
    }
  }

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

  async isAppLocked(lockId: string): Promise<boolean> {
    const existingLockId = await this.getAppLock();

    if (!existingLockId) {
      return false;
    }

    if (lockId !== existingLockId) {
      throw new TransactionError('Invalid lock ID!');
    } else {
      return true;
    }
  }

  async lockApp(): Promise<{ lockId: string }> {
    const existingLockId = await this.getAppLock();

    if (existingLockId) {
      throw new TransactionError('App already locked!');
    }

    const lockId = crypto.randomUUID();
    await this.addOrUpdateAppLock(lockId);
    return { lockId };
  }

  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    await writeFile(join(this.localStateDirectoryPath, stateFileName), data);
  }

  async unlockApp(lockId: string): Promise<void> {
    const existingLockId = await this.getAppLock();

    if (!existingLockId) {
      return;
    }

    if (lockId !== existingLockId) {
      throw new TransactionError('Invalid lock ID!');
    }
    await this.addOrUpdateAppLock('');
  }

  async updateAppLockTransaction(lockId: string): Promise<void> {
    const isAppLocked = await this.isAppLocked(lockId);
    if (!isAppLocked) {
      throw new TransactionError('App is unlocked!');
    }
  }
}
