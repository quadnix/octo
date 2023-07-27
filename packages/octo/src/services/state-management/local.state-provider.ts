import { readFile, writeFile } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { SerializationService } from '../../functions/serialization/serialization.service';
import { IStateProvider } from './state-provider.interface';

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

const APPLICATION_STATE_FILE_NAME = 'infrastructure.json';

export class LocalStateProvider implements IStateProvider {
  private readonly localStateDirectoryPath: string;

  constructor(localStateDirectoryPath: string) {
    this.localStateDirectoryPath = resolve(localStateDirectoryPath);
  }

  async getApplicationState(): Promise<ReturnType<SerializationService['serialize']>> {
    const contents = await readFileAsync(join(this.localStateDirectoryPath, APPLICATION_STATE_FILE_NAME));
    return JSON.parse(contents.toString());
  }

  async getBufferState(stateFileName: string): Promise<Buffer> {
    return readFileAsync(join(this.localStateDirectoryPath, stateFileName));
  }

  async saveApplicationState(serializedState: ReturnType<SerializationService['serialize']>): Promise<void> {
    await writeFileAsync(
      join(this.localStateDirectoryPath, APPLICATION_STATE_FILE_NAME),
      JSON.stringify(serializedState, null, 2),
    );
  }

  async saveBufferState(stateFileName: string, data: Buffer): Promise<void> {
    await writeFileAsync(join(this.localStateDirectoryPath, stateFileName), data);
  }
}
