import type { IStateProvider } from './state-provider.interface.js';

export class TestStateProvider implements IStateProvider {
  private readonly localState: { [key: string]: Buffer } = {};

  async getState(stateFileName: string): Promise<Buffer> {
    if (!(stateFileName in this.localState)) {
      throw new Error('No state found!');
    }
    return this.localState[stateFileName];
  }

  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    this.localState[stateFileName] = data;
  }
}
