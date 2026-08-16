import { join, resolve } from 'path';
import { TransactionError } from '../../errors/index.js';
import { FileUtility } from '../../utilities/file/file.utility.js';
import type { IStateProvider } from './state-provider.interface.js';

/**
 * Keeps state in a local directory, encrypted, with an `.enc` suffix.
 *
 * The point is that the resulting files are safe to commit to version control, which gives a small
 * team shared state without any infrastructure to run.
 *
 * @example
 * ```ts
 * await octo.initialize(new LocalEncryptionStateProvider('./infrastructure', process.env.OCTO_KEY!));
 * ```
 *
 * @group Services/State Management
 *
 * @see Techniques for [State Providers](/docs/techniques/state-providers).
 */
export class LocalEncryptionStateProvider implements IStateProvider {
  private readonly encryptionKey: string;

  private readonly localStateDirectoryPath: string;

  /**
   * @param localStateDirectoryPath The directory state files are written into.
   * @param encryptionKey The key state is encrypted with. It must be at least 3 characters.
   * @throws {@link TransactionError} If the key is too weak.
   */
  constructor(localStateDirectoryPath: string, encryptionKey: string) {
    if (encryptionKey.length < 3) {
      throw new TransactionError('Selected encryption key is too weak!');
    }
    this.encryptionKey = encryptionKey;

    this.localStateDirectoryPath = resolve(localStateDirectoryPath);
  }

  /**
   * Reads a state file.
   *
   * @throws {@link TransactionError} With the message `No state found!` when the file does not exist.
   */
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

  /**
   * Writes a state file, overwriting whatever was there.
   */
  async saveState(stateFileName: string, data: Buffer): Promise<void> {
    await FileUtility.encryptBufferToFile(
      data,
      join(this.localStateDirectoryPath, stateFileName + '.enc'),
      this.encryptionKey,
    );
  }
}
