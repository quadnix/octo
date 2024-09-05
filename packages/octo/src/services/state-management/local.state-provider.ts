import { readFile, writeFile } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { TransactionError } from '../../errors/index.js';
import type { IStateProvider } from './state-provider.interface.js';

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

export class LocalStateProvider implements IStateProvider {
  private readonly localStateDirectoryPath: string;

  constructor(localStateDirectoryPath: string) {
    this.localStateDirectoryPath = resolve(localStateDirectoryPath);
  }

  async getState(stateFileName: string): Promise<Buffer> {
    try {
      return await readFileAsync(join(this.localStateDirectoryPath, stateFileName));
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new TransactionError('No state found!');
      }
      throw error;
    }
  }

  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    await writeFileAsync(join(this.localStateDirectoryPath, stateFileName), data);
  }
}
