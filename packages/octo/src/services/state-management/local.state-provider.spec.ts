import { mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { attributeToModule, create } from '../../utilities/test-helpers/test-models.js';
import { createTestResources } from '../../utilities/test-helpers/test-resources.js';
import { ModelSerializationService } from '../serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from '../serialization/resource/resource-serialization.service.js';
import { LocalStateProvider } from './local.state-provider.js';
import { StateManagementService } from './state-management.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let commitCount = 0;
const newCommitId = (): string => `${Date.now()}-${++commitCount}`;

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

  describe('archiveState()', () => {
    let localStateProvider: LocalStateProvider;
    let stateDirectoryPath: string;

    beforeEach(async () => {
      stateDirectoryPath = await mkdtemp(join(tmpdir(), 'octo-local-state-'));
      localStateProvider = new LocalStateProvider(stateDirectoryPath);
    });

    afterEach(async () => {
      await rm(stateDirectoryPath, { force: true, recursive: true });
    });

    it('should leave the state as it was when the archive cannot be built', async () => {
      await localStateProvider.saveStates([{ data: Buffer.from('{}'), stateFileName: 'journal.1.commit.json' }]);
      await writeFile(join(stateDirectoryPath, 'archives'), 'not a directory');

      await expect(localStateProvider.archiveState('1000000000000-a')).rejects.toThrow();
      expect((await readdir(stateDirectoryPath)).sort()).toEqual(['archives', 'journal.1.commit.json']);
    });

    it('should copy every state file and move every journal file into the archive of the commit', async () => {
      await localStateProvider.saveStates([
        { data: Buffer.from('{"m":1}'), stateFileName: 'models.json' },
        { data: Buffer.from('{"t":1}'), stateFileName: 'module-1.tfstate' },
        { data: Buffer.from('{"j":1}'), stateFileName: 'journal.1.commit.json' },
      ]);
      await localStateProvider.lockApp({ commitId: '1000000000000-a' });

      await localStateProvider.archiveState('1000000000000-a');

      expect(await readdir(join(stateDirectoryPath, 'archives'))).toEqual(['1000000000000-a']);
      expect((await readdir(join(stateDirectoryPath, 'archives', '1000000000000-a'))).sort()).toEqual([
        'journal.1.commit.json',
        'models.json',
        'module-1.tfstate',
      ]);
      expect((await readdir(stateDirectoryPath)).sort()).toEqual([
        'archives',
        'local-state.lock',
        'models.json',
        'module-1.tfstate',
      ]);
    });

    it('should add to the archive when a commit is sealed again', async () => {
      await localStateProvider.saveStates([{ data: Buffer.from('{}'), stateFileName: 'journal.1.commit.json' }]);
      await localStateProvider.archiveState('1000000000000-a');
      await localStateProvider.saveStates([{ data: Buffer.from('{}'), stateFileName: 'journal.2.unlock.json' }]);

      await localStateProvider.archiveState('1000000000000-a');

      expect(await readdir(join(stateDirectoryPath, 'archives'))).toEqual(['1000000000000-a']);
      expect((await readdir(join(stateDirectoryPath, 'archives', '1000000000000-a'))).sort()).toEqual([
        'journal.1.commit.json',
        'journal.2.unlock.json',
      ]);
    });

    it('should delete temporary files a killed process left, keeping them out of the archive', async () => {
      await localStateProvider.saveStates([{ data: Buffer.from('{"m":1}'), stateFileName: 'models.json' }]);
      await writeFile(await localStateProvider.getTemporaryFilePath('models.json'), 'half');

      await localStateProvider.archiveState('1000000000000-a');

      expect((await readdir(stateDirectoryPath)).sort()).toEqual(['archives', 'models.json']);
      expect(await readdir(join(stateDirectoryPath, 'archives', '1000000000000-a'))).toEqual(['models.json']);
    });
  });

  describe('app lock', () => {
    let localStateProvider: LocalStateProvider;
    let stateDirectoryPath: string;

    beforeEach(async () => {
      stateDirectoryPath = await mkdtemp(join(tmpdir(), 'octo-local-state-'));
      localStateProvider = new LocalStateProvider(stateDirectoryPath);
    });

    afterEach(async () => {
      await rm(stateDirectoryPath, { force: true, recursive: true });
    });

    it('should throw error naming the holder when locking an app that is already locked', async () => {
      const { lockId } = await localStateProvider.lockApp({ commitId: newCommitId() });

      await expect(localStateProvider.lockApp({ commitId: newCommitId() })).rejects.toThrow(
        `App already locked with lock ID "${lockId}", held for 0s!`,
      );
    });

    // How long it has been held is what says whether the holder is still working, which is the one
    // question a person answers before finishing the run through its lock.
    it('should report how long the lock has been held', async () => {
      const startedAt = Date.now() - (4 * 60 * 60 * 1000 + 12 * 60 * 1000);
      await writeFile(
        join(stateDirectoryPath, 'local-state.lock'),
        JSON.stringify({ lockId: 'a-held-lock-id', startedAt }),
      );

      await expect(localStateProvider.lockApp({ commitId: newCommitId() })).rejects.toThrow(
        'App already locked with lock ID "a-held-lock-id", held for 4h 12m!',
      );
    });

    // A lock file written before the record carried a time still names its holder.
    it('should report a lock holding nothing but an ID', async () => {
      await writeFile(join(stateDirectoryPath, 'local-state.lock'), 'a-lock-id-from-an-older-run');

      await expect(localStateProvider.lockApp({ commitId: newCommitId() })).rejects.toThrow(
        'App already locked with lock ID "a-lock-id-from-an-older-run"!',
      );
    });

    it('should throw error when checking a lock ID that is not the one held', async () => {
      await localStateProvider.lockApp({ commitId: newCommitId() });

      await expect(localStateProvider.isAppLocked('not-the-lock')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Invalid lock ID!"`,
      );
    });

    it('should throw error when unlocking with a lock ID that is not the one held', async () => {
      await localStateProvider.lockApp({ commitId: newCommitId() });

      await expect(localStateProvider.unlockApp('not-the-lock')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Invalid lock ID!"`,
      );
    });

    it('should throw error when resuming a lock ID that is not the one held', async () => {
      await localStateProvider.lockApp({ commitId: newCommitId() });

      await expect(localStateProvider.lockApp({ lockId: 'not-the-lock' })).rejects.toThrowErrorMatchingInlineSnapshot(
        `"App is not locked with lock ID "not-the-lock"!"`,
      );
    });

    it('should resume the lock held', async () => {
      const { lockId } = await localStateProvider.lockApp({ commitId: newCommitId() });

      expect(await localStateProvider.lockApp({ lockId })).toEqual({ commitId: expect.any(String), lockId });
    });

    it('should report an unlocked app', async () => {
      expect(await localStateProvider.getAppLock()).toBeUndefined();
      expect(await localStateProvider.isAppLocked('any-lock')).toBe(false);
    });

    it('should hold the lock it took', async () => {
      const { lockId } = await localStateProvider.lockApp({ commitId: newCommitId() });

      expect(await localStateProvider.getAppLock()).toBe(lockId);
      expect(await localStateProvider.isAppLocked(lockId)).toBe(true);
    });

    it('should keep the lock held when the run cannot be archived', async () => {
      const { lockId } = await localStateProvider.lockApp({ commitId: newCommitId() });
      await writeFile(join(stateDirectoryPath, 'archives'), 'not a directory');

      await expect(localStateProvider.unlockApp(lockId)).rejects.toThrow();
      expect(await localStateProvider.getAppLock()).toBe(lockId);
    });

    it('should release the lock it took', async () => {
      const { lockId } = await localStateProvider.lockApp({ commitId: newCommitId() });

      await localStateProvider.unlockApp(lockId);

      expect(await localStateProvider.getAppLock()).toBeUndefined();
    });

    it('should seal the run before releasing the lock', async () => {
      const { lockId } = await localStateProvider.lockApp({ commitId: newCommitId() });
      await localStateProvider.saveStates([{ data: Buffer.from('{"m":1}'), stateFileName: 'models.json' }]);

      await localStateProvider.unlockApp(lockId);

      await expect(localStateProvider.getSealedStates(['models.json'])).resolves.toEqual([Buffer.from('{"m":1}')]);
      const [archiveName] = await readdir(join(stateDirectoryPath, 'archives'));
      expect(await readdir(join(stateDirectoryPath, 'archives', archiveName))).toEqual(['models.json']);
    });

    it('should seal under the commit id the lock was taken with', async () => {
      const { lockId } = await localStateProvider.lockApp({ commitId: '1000000000000-a' });
      await localStateProvider.saveStates([{ data: Buffer.from('{"m":1}'), stateFileName: 'models.json' }]);

      await localStateProvider.unlockApp(lockId);

      expect(await readdir(join(stateDirectoryPath, 'archives'))).toEqual(['1000000000000-a']);
    });

    it('should not throw when unlocking an app that is not locked', async () => {
      await expect(localStateProvider.unlockApp('any-lock')).resolves.not.toThrow();
    });

    // The lock is worth nothing if two runners can both believe they hold it, which is what a read
    // followed by a write would allow.
    it('should give the lock to exactly one of two callers racing for it', async () => {
      const results = await Promise.allSettled([
        localStateProvider.lockApp({ commitId: newCommitId() }),
        localStateProvider.lockApp({ commitId: newCommitId() }),
      ]);

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
         "modules": {},
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
      await attributeToModule([app]);

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

  describe('getSealedStates()', () => {
    let localStateProvider: LocalStateProvider;
    let stateDirectoryPath: string;

    beforeEach(async () => {
      stateDirectoryPath = await mkdtemp(join(tmpdir(), 'octo-local-state-'));
      localStateProvider = new LocalStateProvider(stateDirectoryPath);
    });

    afterEach(async () => {
      await rm(stateDirectoryPath, { force: true, recursive: true });
    });

    it('should read nothing when nothing is sealed yet', async () => {
      await localStateProvider.saveStates([{ data: Buffer.from('{"m":1}'), stateFileName: 'models.json' }]);

      await expect(localStateProvider.getSealedStates(['models.json', 'r.json'])).resolves.toEqual([
        undefined,
        undefined,
      ]);
    });

    it('should read every file from the newest archive, and nothing for a file it does not hold', async () => {
      await localStateProvider.saveStates([
        { data: Buffer.from('{"m":1}'), stateFileName: 'models.json' },
        { data: Buffer.from('{"r":1}'), stateFileName: 'r.json' },
      ]);
      await localStateProvider.archiveState('1000000000000-a');
      await localStateProvider.saveStates([
        { data: Buffer.from('{"m":2}'), stateFileName: 'models.json' },
        { data: undefined, stateFileName: 'r.json' },
      ]);
      await localStateProvider.archiveState('2000000000000-b');

      await expect(localStateProvider.getSealedStates(['models.json', 'r.json'])).resolves.toEqual([
        Buffer.from('{"m":2}'),
        undefined,
      ]);
    });

    it('should read nothing older when the newest archive holds no such file', async () => {
      await localStateProvider.saveStates([{ data: Buffer.from('{"m":1}'), stateFileName: 'models.json' }]);
      await localStateProvider.archiveState('1000000000000-a');
      await localStateProvider.saveStates([{ data: undefined, stateFileName: 'models.json' }]);
      await localStateProvider.archiveState('2000000000000-b');

      await expect(localStateProvider.getSealedStates(['models.json'])).resolves.toEqual([undefined]);
    });

    it('should read the archive with the newest time, whatever order the names sort in', async () => {
      await localStateProvider.saveStates([{ data: Buffer.from('{"m":2}'), stateFileName: 'models.json' }]);
      await localStateProvider.archiveState('2000000000000-a');
      await localStateProvider.saveStates([{ data: Buffer.from('{"m":1}'), stateFileName: 'models.json' }]);
      await localStateProvider.archiveState('1000000000000-z');

      await expect(localStateProvider.getSealedStates(['models.json'])).resolves.toEqual([Buffer.from('{"m":2}')]);
    });

    it('should read the newest archive, not what a run wrote since', async () => {
      await localStateProvider.saveStates([{ data: Buffer.from('{"m":1}'), stateFileName: 'models.json' }]);
      await localStateProvider.archiveState('1000000000000-a');
      await localStateProvider.saveStates([{ data: Buffer.from('{"m":2}'), stateFileName: 'models.json' }]);

      await expect(localStateProvider.getSealedStates(['models.json'])).resolves.toEqual([Buffer.from('{"m":1}')]);
    });

    it('should ignore a folder not named by a time, such as one still being sealed', async () => {
      await localStateProvider.saveStates([{ data: Buffer.from('{"m":1}'), stateFileName: 'models.json' }]);
      await localStateProvider.archiveState('1000000000000-a');
      await mkdir(join(stateDirectoryPath, 'archives', '.sealing-2000000000000-b'));
      await mkdir(join(stateDirectoryPath, 'archives', '99999999-9999-4999-8999-999999999999'));

      await expect(localStateProvider.getSealedStates(['models.json'])).resolves.toEqual([Buffer.from('{"m":1}')]);
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

    it('should move a file given by its path', async () => {
      const stateDirectoryPath = await mkdtemp(join(tmpdir(), 'octo-local-state-'));
      const localStateProvider = new LocalStateProvider(stateDirectoryPath);
      const filePath = await localStateProvider.getTemporaryFilePath('source.json');
      await writeFile(filePath, 'saved');

      await localStateProvider.saveStates([{ filePath, stateFileName: 'journal.1.apply.terraform.json' }]);

      await expect(localStateProvider.getState('journal.1.apply.terraform.json')).resolves.toEqual(
        Buffer.from('saved'),
      );
      expect(await readdir(stateDirectoryPath)).toEqual(['journal.1.apply.terraform.json']);
      await rm(stateDirectoryPath, { force: true, recursive: true });
    });

    it('should leave no temporary file behind', async () => {
      const stateDirectoryPath = await mkdtemp(join(tmpdir(), 'octo-local-state-'));
      const localStateProvider = new LocalStateProvider(stateDirectoryPath);

      await localStateProvider.saveStates([{ data: Buffer.from('saved'), stateFileName: 'models.json' }]);

      expect(await readdir(stateDirectoryPath)).toEqual(['models.json']);
      expect(await readFile(join(stateDirectoryPath, 'models.json'), 'utf-8')).toBe('saved');
      await rm(stateDirectoryPath, { force: true, recursive: true });
    });
  });
});
