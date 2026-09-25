import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'path';
import { LocalEncryptionStateProvider } from './local-encryption.state-provider.js';

describe('LocalEncryptionStateProvider UT', () => {
  let localEncryptionStateProvider: LocalEncryptionStateProvider;
  let stateDirectoryPath: string;

  beforeEach(async () => {
    stateDirectoryPath = await mkdtemp(join(tmpdir(), 'octo-local-encryption-state-'));
    localEncryptionStateProvider = new LocalEncryptionStateProvider(stateDirectoryPath, 'test-encryption-key');
  });

  afterEach(async () => {
    await rm(stateDirectoryPath, { force: true, recursive: true });
  });

  describe('listStates()', () => {
    it('should return nothing when the directory does not exist yet', async () => {
      await rm(stateDirectoryPath, { force: true, recursive: true });

      await expect(localEncryptionStateProvider.listStates('resource-state-')).resolves.toEqual([]);
    });

    it('should return nothing when nothing matches the prefix', async () => {
      await localEncryptionStateProvider.saveStates([{ data: Buffer.from('saved'), stateFileName: 'models.json' }]);

      await expect(localEncryptionStateProvider.listStates('resource-state-')).resolves.toEqual([]);
    });

    // Every file on disk carries an `.enc` suffix the caller never names.
    it('should return the state file names without the encryption suffix', async () => {
      await localEncryptionStateProvider.saveStates([
        { data: Buffer.from('saved'), stateFileName: 'resource-state-igw-1.json' },
      ]);
      await localEncryptionStateProvider.saveStates([
        { data: Buffer.from('saved'), stateFileName: 'resource-state-igw-2.json' },
      ]);

      const stateFileNames = await localEncryptionStateProvider.listStates('resource-state-');
      expect(stateFileNames.sort()).toEqual(['resource-state-igw-1.json', 'resource-state-igw-2.json']);
    });

    it('should return a name the state can be read back by', async () => {
      await localEncryptionStateProvider.saveStates([
        { data: Buffer.from('published'), stateFileName: 'resource-state-igw-1.json' },
      ]);

      const [stateFileName] = await localEncryptionStateProvider.listStates('resource-state-');
      await expect(localEncryptionStateProvider.getState(stateFileName)).resolves.toEqual(Buffer.from('published'));
    });

    it('should not return a deleted state file', async () => {
      await localEncryptionStateProvider.saveStates([
        { data: Buffer.from('saved'), stateFileName: 'resource-state-igw-1.json' },
      ]);
      await localEncryptionStateProvider.saveStates([{ data: undefined, stateFileName: 'resource-state-igw-1.json' }]);

      await expect(localEncryptionStateProvider.listStates('resource-state-')).resolves.toEqual([]);
    });
  });
});
