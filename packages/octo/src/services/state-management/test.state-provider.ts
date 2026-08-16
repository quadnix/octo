import { TransactionError } from '../../errors/index.js';
import type { IStateProvider } from './state-provider.interface.js';

/**
 * Keeps state in memory, and discards it when the process ends. For tests.
 *
 * @group Services/State Management
 *
 * @see Techniques for [State Providers](/docs/techniques/state-providers).
 */
export class TestStateProvider implements IStateProvider {
  private readonly localState: { [key: string]: Buffer } = {};

  /**
   * Reads a state file.
   *
   * @throws {@link TransactionError} With the message `No state found!` when the file does not exist.
   */
  async getState(stateFileName: string): Promise<Buffer> {
    if (!(stateFileName in this.localState)) {
      throw new TransactionError('No state found!');
    }
    return this.localState[stateFileName];
  }

  /**
   * Writes a state file, overwriting whatever was there.
   */
  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    this.localState[stateFileName] = data;
  }
}
