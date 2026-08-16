import { readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { TransactionError } from '../../errors/index.js';
import type { IStateProvider } from './state-provider.interface.js';

/**
 * Keeps state in a directory on the local filesystem.
 *
 * Good for experimenting on your own machine. It is not shared, so a team running Octo against the
 * same infrastructure needs a provider that persists somewhere they all reach.
 *
 * @example
 * ```ts
 * await octo.initialize(new LocalStateProvider('./infrastructure'));
 * ```
 *
 * @group Services/State Management
 *
 * @see Techniques for [State Providers](/docs/techniques/state-providers).
 */
export class LocalStateProvider implements IStateProvider {
  private readonly localStateDirectoryPath: string;

  /**
   * @param localStateDirectoryPath The directory state files are written into.
   */
  constructor(localStateDirectoryPath: string) {
    this.localStateDirectoryPath = resolve(localStateDirectoryPath);
  }

  /**
   * Reads a state file.
   *
   * @throws {@link TransactionError} With the message `No state found!` when the file does not exist.
   */
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

  /**
   * Writes a state file, overwriting whatever was there.
   */
  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    await writeFile(join(this.localStateDirectoryPath, stateFileName), data);
  }
}
