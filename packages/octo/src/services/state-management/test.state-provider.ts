import type { IStateProvider } from './state-provider.interface.js';

export class TestStateProvider implements IStateProvider {
  private readonly localState: { [key: string]: Buffer } = {};

  async getState(stateFileName: string): Promise<Buffer> {
    return this.localState[stateFileName];
  }

  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    this.localState[stateFileName] = data;
  }
}
