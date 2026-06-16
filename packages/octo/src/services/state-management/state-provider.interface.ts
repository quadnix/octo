/**
 * @group Services/State Management
 */
export interface IStateProvider {
  getState(stateFileName: string): Promise<Buffer>;

  saveState(stateFileName: string, data: Buffer): Promise<void>;
}
