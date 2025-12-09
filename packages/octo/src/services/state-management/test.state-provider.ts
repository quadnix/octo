import { TransactionError } from '../../errors/index.js';
import type { IStateProvider } from './state-provider.interface.js';

/**
 * @group Services/State Management
 */
export class TestStateProvider implements IStateProvider {
  private readonly localState: { [key: string]: Buffer } = {};
  private lockId: string | null = null;

  async getState(stateFileName: string): Promise<Buffer> {
    if (!(stateFileName in this.localState)) {
      throw new TransactionError('No state found!');
    }
    return this.localState[stateFileName];
  }

  async isAppLocked(lockId: string): Promise<boolean> {
    if (this.lockId === null) {
      return false;
    }

    if (lockId !== this.lockId) {
      throw new TransactionError('Invalid lock ID!');
    } else {
      return true;
    }
  }

  async lockApp(): Promise<{ lockId: string }> {
    if (this.lockId !== null) {
      throw new TransactionError('App already locked!');
    }

    this.lockId = 'default_lock';
    return { lockId: this.lockId };
  }

  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    this.localState[stateFileName] = data;
  }

  async unlockApp(lockId: string): Promise<void> {
    if (this.lockId === null) {
      return;
    }

    if (lockId !== this.lockId) {
      throw new TransactionError('Invalid lock ID!');
    }
    this.lockId = null;
  }

  async updateAppLockTransaction(lockId: string): Promise<void> {
    const isAppLocked = await this.isAppLocked(lockId);
    if (!isAppLocked) {
      throw new TransactionError('App is unlocked!');
    }
  }
}
