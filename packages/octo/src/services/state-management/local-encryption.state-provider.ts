import { join, resolve } from 'path';
import { TransactionError } from '../../errors/index.js';
import { FileUtility } from '../../utilities/file/file.utility.js';
import type { IStateProvider } from './state-provider.interface.js';

/**
 * @group Services/State Management
 */
export class LocalEncryptionStateProvider implements IStateProvider {
  private readonly encryptionKey: string;

  private readonly localStateDirectoryPath: string;

  constructor(localStateDirectoryPath: string, encryptionKey: string) {
    if (encryptionKey.length < 3) {
      throw new TransactionError('Selected encryption key is too weak!');
    }
    this.encryptionKey = encryptionKey;

    this.localStateDirectoryPath = resolve(localStateDirectoryPath);
  }

  async getState(stateFileName: string): Promise<Buffer> {
    try {
      return await FileUtility.decryptFileToBuffer(
        join(this.localStateDirectoryPath, stateFileName + '.enc'),
        this.encryptionKey,
      );
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new TransactionError('No state found!');
      }
      throw error;
    }
  }

  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    await FileUtility.encryptBufferToFile(
      data,
      join(this.localStateDirectoryPath, stateFileName + '.enc'),
      this.encryptionKey,
    );
  }
}
