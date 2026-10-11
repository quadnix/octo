import { mkdtemp, rm, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { create } from '../../utilities/test-helpers/test-models.js';
import { createTestResources } from '../../utilities/test-helpers/test-resources.js';
import { ModelSerializationService } from '../serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from '../serialization/resource/resource-serialization.service.js';
import { LocalStateProvider } from './local.state-provider.js';
import { StateManagementService } from './state-management.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('LocalStateProvider UT', () => {
  let container: Container;
  let filePath: string;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
  });

  afterEach(async () => {
    await TestContainer.reset();

    if (filePath) {
      await unlink(filePath);
      filePath = '';
    }
  });

  describe('app lock', () => {
    let localStateProvider: LocalStateProvider;

    beforeEach(() => {
      localStateProvider = new LocalStateProvider(__dirname);
    });

    afterEach(async () => {
      const lockId = await localStateProvider.getAppLock();
      if (lockId) {
        await localStateProvider.unlockApp(lockId);
      }
    });

    it('should throw error naming the holder when locking an app that is already locked', async () => {
      const { lockId } = await localStateProvider.lockApp();

      await expect(localStateProvider.lockApp()).rejects.toThrow(
        `App already locked with lock ID "${lockId}", held for 0s!`,
      );
    });

    // How long it has been held is what says whether the holder is still working, which is the one
    // question a person answers before finishing the run through its lock.
    it('should report how long the lock has been held', async () => {
      const startedAt = new Date(Date.now() - (4 * 60 * 60 * 1000 + 12 * 60 * 1000)).toISOString();
      await writeFile(join(__dirname, 'local-state.lock'), JSON.stringify({ lockId: 'a-held-lock-id', startedAt }));

      await expect(localStateProvider.lockApp()).rejects.toThrow(
        'App already locked with lock ID "a-held-lock-id", held for 4h 12m!',
      );
    });

    // A lock file written before the record carried a time still names its holder.
    it('should report a lock holding nothing but an ID', async () => {
      await writeFile(join(__dirname, 'local-state.lock'), 'a-lock-id-from-an-older-run');

      await expect(localStateProvider.lockApp()).rejects.toThrow(
        'App already locked with lock ID "a-lock-id-from-an-older-run"!',
      );
    });

    it('should throw error when checking a lock ID that is not the one held', async () => {
      await localStateProvider.lockApp();

      await expect(localStateProvider.isAppLocked('not-the-lock')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Invalid lock ID!"`,
      );
    });

    it('should throw error when unlocking with a lock ID that is not the one held', async () => {
      await localStateProvider.lockApp();

      await expect(localStateProvider.unlockApp('not-the-lock')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Invalid lock ID!"`,
      );
    });

    it('should throw error when resuming a lock ID that is not the one held', async () => {
      await localStateProvider.lockApp();

      await expect(localStateProvider.lockApp('not-the-lock')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"App is not locked with lock ID "not-the-lock"!"`,
      );
    });

    it('should resume the lock held', async () => {
      const { lockId } = await localStateProvider.lockApp();

      expect(await localStateProvider.lockApp(lockId)).toEqual({ lockId });
    });

    it('should report an unlocked app', async () => {
      expect(await localStateProvider.getAppLock()).toBeUndefined();
      expect(await localStateProvider.isAppLocked('any-lock')).toBe(false);
    });

    it('should hold the lock it took', async () => {
      const { lockId } = await localStateProvider.lockApp();

      expect(await localStateProvider.getAppLock()).toBe(lockId);
      expect(await localStateProvider.isAppLocked(lockId)).toBe(true);
    });

    it('should release the lock it took', async () => {
      const { lockId } = await localStateProvider.lockApp();

      await localStateProvider.unlockApp(lockId);

      expect(await localStateProvider.getAppLock()).toBeUndefined();
    });

    it('should not throw when unlocking an app that is not locked', async () => {
      await expect(localStateProvider.unlockApp('any-lock')).resolves.not.toThrow();
    });

    // The lock is worth nothing if two runners can both believe they hold it, which is what a read
    // followed by a write would allow.
    it('should give the lock to exactly one of two callers racing for it', async () => {
      const results = await Promise.allSettled([localStateProvider.lockApp(), localStateProvider.lockApp()]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    });
  });

  describe('getModelState()', () => {
    it('should be able to get a default state', async () => {
      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      const { data, userData } = await stateManagementService.getModelState('models1.json');
      expect(data).toMatchInlineSnapshot(`
       {
         "anchors": [],
         "dependencies": [],
         "models": {},
         "overlays": [],
       }
      `);
      expect(userData).toMatchInlineSnapshot(`{}`);
    });

    it('should be able to retrieve a frozen state', async () => {
      filePath = join(__dirname, 'models2.json');
      const modelSerializationService = await container.get(ModelSerializationService);

      const {
        app: [app],
      } = create({ app: ['test'] });

      const serializedOutput = await modelSerializationService.serialize(app);

      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      await stateManagementService.saveModelState('models2.json', serializedOutput, { version: 1 });
      const { data, userData } = await stateManagementService.getModelState('models2.json');

      expect(() => {
        data['key1'] = 'value1';
      }).toThrow();
      expect(() => {
        userData['key2'] = 'value2';
      }).toThrow();
    });
  });

  describe('getResourceState()', () => {
    it('should be able to get a default state', async () => {
      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      const { data, userData } = await stateManagementService.getResourceState('resources1.json');
      expect(data).toMatchInlineSnapshot(`
       {
         "dependencies": [],
         "resources": {},
       }
      `);
      expect(userData).toMatchInlineSnapshot(`{}`);
    });

    it('should be able to retrieve a frozen state', async () => {
      filePath = join(__dirname, 'resources2.json');
      const resourceSerializationService = await container.get(ResourceSerializationService);

      await createTestResources([{ resourceContext: '@octo/test-resource=resource-1' }]);

      const serializedOutput = await resourceSerializationService.serializeNewResources();

      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      await stateManagementService.saveResourceState('resources2.json', serializedOutput, { version: 1 });
      const { data, userData } = await stateManagementService.getModelState('resources2.json');

      expect(() => {
        data['key1'] = 'value1';
      }).toThrow();
      expect(() => {
        userData['key2'] = 'value2';
      }).toThrow();
    });
  });

  describe('getState()', () => {
    it('should be able to get a default state', async () => {
      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      const state = await stateManagementService.getState('manifest1.json', 'default');
      expect(state).toMatchInlineSnapshot(`"default"`);
    });

    it('should be able to get the saved state', async () => {
      filePath = join(__dirname, 'manifest2.json');

      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      const data = Buffer.from(
        JSON.stringify({
          key1: 'value1',
          key2: 'value2',
        }),
      );
      await stateManagementService.saveStates([{ data: data, stateFileName: 'manifest2.json' }]);

      const manifestData = await stateManagementService.getState('manifest2.json');
      expect(JSON.parse(manifestData.toString())).toMatchInlineSnapshot(`
      {
        "key1": "value1",
        "key2": "value2",
      }
    `);
    });
  });

  describe('listStates()', () => {
    // Its own directory: this is the one method that reads whatever else the directory holds.
    let localStateProvider: LocalStateProvider;
    let stateDirectoryPath: string;

    beforeEach(async () => {
      stateDirectoryPath = await mkdtemp(join(tmpdir(), 'octo-local-state-'));
      localStateProvider = new LocalStateProvider(stateDirectoryPath);
    });

    afterEach(async () => {
      await rm(stateDirectoryPath, { force: true, recursive: true });
    });

    it('should return nothing when the directory does not exist yet', async () => {
      await rm(stateDirectoryPath, { force: true, recursive: true });

      await expect(localStateProvider.listStates('resource-state-')).resolves.toEqual([]);
    });

    it('should return nothing when nothing matches the prefix', async () => {
      await localStateProvider.saveStates([{ data: Buffer.from('saved'), stateFileName: 'models.json' }]);

      await expect(localStateProvider.listStates('resource-state-')).resolves.toEqual([]);
    });

    it('should return only the state files matching the prefix', async () => {
      await localStateProvider.saveStates([{ data: Buffer.from('saved'), stateFileName: 'models.json' }]);
      await localStateProvider.saveStates([{ data: Buffer.from('saved'), stateFileName: 'resource-state-igw-1.json' }]);
      await localStateProvider.saveStates([{ data: Buffer.from('saved'), stateFileName: 'resource-state-igw-2.json' }]);

      const stateFileNames = await localStateProvider.listStates('resource-state-');
      expect(stateFileNames.sort()).toEqual(['resource-state-igw-1.json', 'resource-state-igw-2.json']);
    });

    it('should return a name the state can be read back by', async () => {
      await localStateProvider.saveStates([
        { data: Buffer.from('published'), stateFileName: 'resource-state-igw-1.json' },
      ]);

      const [stateFileName] = await localStateProvider.listStates('resource-state-');
      await expect(localStateProvider.getState(stateFileName)).resolves.toEqual(Buffer.from('published'));
    });

    it('should not return a deleted state file', async () => {
      await localStateProvider.saveStates([{ data: Buffer.from('saved'), stateFileName: 'resource-state-igw-1.json' }]);
      await localStateProvider.saveStates([{ data: undefined, stateFileName: 'resource-state-igw-1.json' }]);

      await expect(localStateProvider.listStates('resource-state-')).resolves.toEqual([]);
    });
  });

  describe('saveStates()', () => {
    it('should not throw when there is nothing to delete', async () => {
      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      await expect(
        stateManagementService.saveStates([{ data: undefined, stateFileName: 'manifest3.json' }]),
      ).resolves.not.toThrow();
    });

    it('should delete the saved state', async () => {
      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      await stateManagementService.saveStates([{ data: Buffer.from('saved'), stateFileName: 'manifest4.json' }]);
      await stateManagementService.saveStates([{ data: undefined, stateFileName: 'manifest4.json' }]);

      await expect(stateManagementService.getState('manifest4.json')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"No state found!"`,
      );
    });

    it('should write a nested name into a directory beneath the state directory', async () => {
      const stateDirectoryPath = await mkdtemp(join(tmpdir(), 'octo-local-state-'));
      const localStateProvider = new LocalStateProvider(stateDirectoryPath);

      await localStateProvider.saveStates([{ data: Buffer.from('saved'), stateFileName: 'archives/c/r.json' }]);

      await expect(localStateProvider.getState('archives/c/r.json')).resolves.toEqual(Buffer.from('saved'));
      await rm(stateDirectoryPath, { force: true, recursive: true });
    });
  });
});
