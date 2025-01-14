import { readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { TransactionError } from '../../errors/index.js';
import type { IStateProvider } from './state-provider.interface.js';

export class LocalStateProvider implements IStateProvider {
  private readonly localStateDirectoryPath: string;

  constructor(localStateDirectoryPath: string) {
    this.localStateDirectoryPath = resolve(localStateDirectoryPath);
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

  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    await writeFile(join(this.localStateDirectoryPath, stateFileName), data);
  }
}
