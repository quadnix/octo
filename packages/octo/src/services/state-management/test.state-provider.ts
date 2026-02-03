import { TransactionError } from '../../errors/index.js';
import type { IStateProvider } from './state-provider.interface.js';

/**
 * @group Services/State Management
 */
export class TestStateProvider implements IStateProvider {
  private readonly localState: { [key: string]: Buffer } = {};
  private lockId: string | undefined = undefined;

  async getAppLock(): Promise<string | undefined> {
    return this.lockId;
  }

  async getState(stateFileName: string): Promise<Buffer> {
    if (!(stateFileName in this.localState)) {
      throw new TransactionError('No state found!');
    }
    return this.localState[stateFileName];
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
    this.lockId = lockId;
    return { lockId };
  }

  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    this.localState[stateFileName] = data;
  }

  async unlockApp(lockId: string): Promise<void> {
    const existingLockId = await this.getAppLock();

    if (!existingLockId) {
      return;
    }

    if (lockId !== existingLockId) {
      throw new TransactionError('Invalid lock ID!');
    }
    this.lockId = undefined;
  }

  async updateAppLockTransaction(lockId: string): Promise<void> {
    const isAppLocked = await this.isAppLocked(lockId);
    if (!isAppLocked) {
      throw new TransactionError('App is unlocked!');
    }
  }
}
