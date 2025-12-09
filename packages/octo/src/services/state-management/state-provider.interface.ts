/**
 * @group Services/State Management
 */
export interface IStateProvider {
  getState(stateFileName: string): Promise<Buffer>;

  isAppLocked(lockId: string): Promise<boolean>;

  lockApp(): Promise<{ lockId: string }>;

  saveState(stateFileName: string, data: Buffer): Promise<void>;

  unlockApp(lockId: string): Promise<void>;

  updateAppLockTransaction(lockId: string): Promise<void>;
}
