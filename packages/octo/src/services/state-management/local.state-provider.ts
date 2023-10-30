import { readFile, writeFile } from 'fs';
import { join, resolve } from 'path';
import { Inject, Service, Token } from 'typedi';
import { promisify } from 'util';
import { IStateProvider } from './state-provider.interface.js';

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

export const LocalStateProviderContext = new Token<{ localStateDirectoryPath: string }>();

@Service()
export class LocalStateProvider implements IStateProvider {
  private readonly localStateDirectoryPath: string;

  constructor(@Inject(LocalStateProviderContext) context: { localStateDirectoryPath: string }) {
    this.localStateDirectoryPath = resolve(context.localStateDirectoryPath);
  }

  async getState(stateFileName: string): Promise<Buffer> {
    return readFileAsync(join(this.localStateDirectoryPath, stateFileName));
  }

  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    await writeFileAsync(join(this.localStateDirectoryPath, stateFileName), data);
  }
}
