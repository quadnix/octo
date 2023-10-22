import { readFile, writeFile } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { IStateProvider } from './state-provider.interface.js';

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

export class LocalStateProvider implements IStateProvider {
  private readonly localStateDirectoryPath: string;

  constructor(localStateDirectoryPath: string) {
    this.localStateDirectoryPath = resolve(localStateDirectoryPath);
  }

  async getState(stateFileName: string): Promise<Buffer> {
    return readFileAsync(join(this.localStateDirectoryPath, stateFileName));
  }

  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    await writeFileAsync(join(this.localStateDirectoryPath, stateFileName), data);
  }
}
