import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import { AppLockError, TransactionError } from '../../errors/index.js';
import {
  AppLockRefusedEvent,
  AppLockTakenEvent,
  AppUnlockedEvent,
  AppUnlockingEvent,
  type Event,
  StateFilesSavedEvent,
  StateFilesSavingEvent,
  StateRefreshedEvent,
} from '../../events/index.js';
import { EventService } from '../event/event.service.js';
import { StateManagementService } from './state-management.service.js';
import { TestStateProvider } from './test.state-provider.js';

describe('StateManagementService UT', () => {
  let emitted: Event<unknown>[];
  let service: StateManagementService;
  let stateProvider: TestStateProvider;

  beforeEach(() => {
    emitted = [];
    jest.spyOn(EventService.getInstance(), 'emit').mockImplementation((event) => {
      emitted.push(event);
    });
    jest.spyOn(EventService.getInstance(), 'emitAndWait').mockImplementation(async (event) => {
      emitted.push(event);
    });

    stateProvider = new TestStateProvider();
    service = new StateManagementService(stateProvider);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getResourceResponse()', () => {
    // The committed graph as `commit` writes it, holding one resource with a response.
    async function commitResourceState(resourceId: string, response: Record<string, string>): Promise<void> {
      await service.saveResourceState(
        service.actualResourceStateFileName,
        {
          dependencies: [],
          resources: {
            [`ExternalIgwResource=${resourceId}`]: {
              className: '@octo/ExternalIgwResource',
              resource: {
                localResourceId: resourceId,
                parents: [],
                properties: {},
                resourceId,
                response,
                scope: [],
                tags: {},
              },
            },
          },
        },
        { version: 1 },
      );
    }

    it('should return undefined when neither a published record nor a committed graph holds it', async () => {
      await expect(service.getResourceResponse('igw-1')).resolves.toBeUndefined();
    });

    it('should return undefined when the committed graph holds no such resource', async () => {
      await commitResourceState('igw-2', { igwId: 'igw-0other' });

      await expect(service.getResourceResponse('igw-1')).resolves.toBeUndefined();
    });

    it('should return what the last commit recorded', async () => {
      await commitResourceState('igw-1', { igwId: 'igw-0committed' });

      await expect(service.getResourceResponse('igw-1')).resolves.toEqual({ igwId: 'igw-0committed' });
    });

    it('should coerce a committed response value to a string', async () => {
      await commitResourceState('igw-1', { port: 80 } as unknown as Record<string, string>);

      await expect(service.getResourceResponse('igw-1')).resolves.toEqual({ port: '80' });
    });

    // Between an action publishing and the commit that records it, the published record is the only
    // copy of the response, and it is newer than anything the committed graph holds.
    it('should prefer a published record over the committed graph', async () => {
      await commitResourceState('igw-1', { igwId: 'igw-0committed' });
      await service.saveExternalResourceState('igw-1', {
        inputs: {},
        properties: {},
        response: { igwId: 'igw-0published' },
      });

      await expect(service.getResourceResponse('igw-1')).resolves.toEqual({ igwId: 'igw-0published' });
    });

    it('should hold the record of a resource whose id is not a legal file name', async () => {
      await service.saveExternalResourceState('image-tag-family/image-0-0-1', {
        inputs: {},
        properties: {},
        response: { digest: 'sha256:ab1' },
      });

      await expect(service.getResourceResponse('image-tag-family/image-0-0-1')).resolves.toEqual({
        digest: 'sha256:ab1',
      });
    });

    it('should fall back to the committed graph once the published record is cleared', async () => {
      await commitResourceState('igw-1', { igwId: 'igw-0committed' });
      await service.saveExternalResourceState('igw-1', {
        inputs: {},
        properties: {},
        response: { igwId: 'igw-0published' },
      });
      await service.deleteExternalResourceState('igw-1');

      await expect(service.getResourceResponse('igw-1')).resolves.toEqual({ igwId: 'igw-0committed' });
    });
  });

  describe('listExternalResourceStateIds()', () => {
    it('should return nothing when no action has recorded anything', async () => {
      await expect(service.listExternalResourceStateIds()).resolves.toEqual([]);
    });

    it('should return the resource id of every record', async () => {
      await service.saveExternalResourceState('igw-1', { inputs: {}, properties: {}, response: {} });
      await service.saveExternalResourceState('igw-2', { inputs: {}, properties: {}, response: {} });

      await expect(service.listExternalResourceStateIds()).resolves.toEqual(['igw-1', 'igw-2']);
    });

    // The record of a resource whose id is not a legal file name is stored under an encoded name.
    it('should return a resource id the file name encoded', async () => {
      await service.saveExternalResourceState('image-tag-family/image-0-0-1', {
        inputs: {},
        properties: {},
        response: {},
      });

      await expect(service.listExternalResourceStateIds()).resolves.toEqual(['image-tag-family/image-0-0-1']);
    });

    // The name itself is a contract: a state provider that keeps state somewhere other than a
    // directory hands it to a filesystem, an object store and a URL path segment in turn, and only a
    // plain name survives all three.
    it('should store a record under a name that needs no escaping', async () => {
      await service.saveExternalResourceState('igw-1', { inputs: {}, properties: {}, response: {} });
      await service.saveExternalResourceState('image-tag-family/image-0-0-1', {
        inputs: {},
        properties: {},
        response: {},
      });

      await expect(stateProvider.listStates('resource-state-')).resolves.toEqual([
        'resource-state-igw-1.json',
        'resource-state-image-tag-family.image-0-0-1.json',
      ]);
    });

    it('should not return a record a commit cleared', async () => {
      await service.saveExternalResourceState('igw-1', { inputs: {}, properties: {}, response: {} });
      await service.saveExternalResourceState('igw-2', { inputs: {}, properties: {}, response: {} });
      await service.deleteExternalResourceState('igw-1');

      await expect(service.listExternalResourceStateIds()).resolves.toEqual(['igw-2']);
    });

    // The records sit beside the graph state files, which are not records of anything published.
    it('should not return the graph state files', async () => {
      await service.saveResourceState(service.actualResourceStateFileName, { dependencies: [], resources: {} }, {});
      await service.saveModelState(
        service.modelStateFileName,
        { anchors: [], dependencies: [], models: {}, overlays: [] },
        {},
      );
      await service.saveExternalResourceState('igw-1', { inputs: {}, properties: {}, response: {} });

      await expect(service.listExternalResourceStateIds()).resolves.toEqual(['igw-1']);
    });
  });

  describe('lockApp()', () => {
    it('should emit the refusal and rethrow when the lock is held', async () => {
      const { lockId } = await service.lockApp();

      await expect(service.lockApp()).rejects.toThrow(`App already locked with lock ID "${lockId}"!`);

      const refusal = emitted.find((e) => e instanceof AppLockRefusedEvent) as AppLockRefusedEvent;
      expect(refusal.payload).toMatchObject({ holder: { lockId }, reason: 'held' });
    });

    it('should refuse a new lock over journal files of a command after lock, naming them', async () => {
      await service.saveStates([
        { data: Buffer.from('{}'), stateFileName: 'journal.20261011T100000000Z-00000001.generate.json' },
        { data: Buffer.from('{}'), stateFileName: 'journal.20261011T100000000Z-00000002.commit.json' },
        { data: Buffer.from('{}'), stateFileName: 'journal.20261011T100000000Z-00000002.commit.terraform.json' },
      ]);

      const error = await service.lockApp().catch((e) => e);

      expect(error).toBeInstanceOf(AppLockError);
      expect(error.message).toBe(
        'State holds the journal of a run that was never archived: ' +
          'journal.20261011T100000000Z-00000002.commit.json, journal.20261011T100000000Z-00000002.commit.terraform.json! ' +
          'Move or delete these files, then lock again.',
      );
      const refusal = emitted.find((e) => e instanceof AppLockRefusedEvent) as AppLockRefusedEvent;
      expect(refusal.payload).toMatchObject({
        reason: 'unfinished',
        stateFileNames: [
          'journal.20261011T100000000Z-00000002.commit.json',
          'journal.20261011T100000000Z-00000002.commit.terraform.json',
        ],
      });
      await expect(stateProvider.getAppLock()).resolves.toBeUndefined();
    });

    it('should take a new lock over journal files of generate, validate and lock', async () => {
      await service.saveStates([
        { data: Buffer.from('{}'), stateFileName: 'journal.20261011T100000000Z-00000001.generate.json' },
        { data: Buffer.from('{}'), stateFileName: 'journal.20261011T100000000Z-00000002.validate.terraform.json' },
        { data: Buffer.from('{}'), stateFileName: 'journal.20261011T100000000Z-00000003.lock.json' },
      ]);

      await expect(service.lockApp()).resolves.toMatchObject({ lockId: expect.any(String) });
    });

    it('should not check the journal when resuming a lock', async () => {
      const { lockId } = await service.lockApp();
      await service.saveStates([
        { data: Buffer.from('{}'), stateFileName: 'journal.20261011T100000000Z-00000002.apply.json' },
      ]);

      await expect(service.lockApp(lockId)).resolves.toEqual({ lockId });
    });

    it('should emit the lock taken, and the lock resumed', async () => {
      const { lockId } = await service.lockApp();
      await service.lockApp(lockId);

      expect(emitted.filter((e) => e instanceof AppLockTakenEvent).map((e) => e.payload)).toEqual([
        { commitId: undefined, lockId, resumed: false },
        { commitId: undefined, lockId, resumed: true },
      ]);
    });

    it('should emit where a resume took the state directory from', async () => {
      const { lockId } = await service.lockApp();
      jest.spyOn(stateProvider, 'lockApp').mockResolvedValueOnce({ lockId, resumedFrom: 'run' });
      await service.lockApp(lockId);

      expect(emitted.filter((e) => e instanceof AppLockTakenEvent).at(-1)!.payload).toMatchObject({
        resumed: true,
        resumedFrom: 'run',
      });
    });
  });

  describe('refreshState()', () => {
    it('should emit what the provider refreshed', async () => {
      await service.refreshState();

      expect(emitted.find((e) => e instanceof StateRefreshedEvent)!.payload).toEqual({ replaced: false });
    });
  });

  describe('saveStates()', () => {
    it('should write the files a listener adds before the save, in the same change', async () => {
      jest.spyOn(EventService.getInstance(), 'emitAndWait').mockImplementation(async (event) => {
        if (event instanceof StateFilesSavingEvent) {
          event.payload.stateFiles.push({ data: Buffer.from('added'), stateFileName: 'journal.1.apply.json' });
        }
      });
      const saveStates = jest.spyOn(stateProvider, 'saveStates');

      await service.saveStates([{ data: Buffer.from('saved'), stateFileName: 'a.tfstate' }]);

      expect(saveStates).toHaveBeenCalledTimes(1);
      expect(saveStates.mock.calls[0][0].map((f) => f.stateFileName)).toEqual(['a.tfstate', 'journal.1.apply.json']);
    });

    it('should emit every file written with its digest, and every file deleted', async () => {
      await service.saveStates([
        { data: Buffer.from('saved'), stateFileName: 'a.json' },
        { data: undefined, stateFileName: 'b.json' },
      ]);

      expect(emitted.map((e) => e.constructor)).toEqual([StateFilesSavingEvent, StateFilesSavedEvent]);
      expect((emitted[1] as StateFilesSavedEvent).payload.stateFiles).toEqual([
        { data: Buffer.from('saved'), md5: '536a056b710e94b16169efd17a4a657b', stateFileName: 'a.json' },
        { data: undefined, md5: undefined, stateFileName: 'b.json' },
      ]);
    });

    it('should write a file given by its path, and emit its path without its bytes or digest', async () => {
      const directoryPath = await mkdtemp(join(tmpdir(), 'octo-state-'));
      const filePath = join(directoryPath, 'log.json');
      await writeFile(filePath, 'saved');

      await service.saveStates([{ filePath, stateFileName: 'a.json' }]);

      expect(await service.getState('a.json')).toEqual(Buffer.from('saved'));
      expect((emitted[1] as StateFilesSavedEvent).payload.stateFiles).toEqual([
        { data: undefined, filePath, md5: undefined, stateFileName: 'a.json' },
      ]);
      await rm(directoryPath, { force: true, recursive: true });
    });
  });

  describe('unlockApp()', () => {
    const journalFileNames = [
      'journal.20261011T100000000Z-00000001.generate.json',
      'journal.20261011T100000000Z-00000002.commit.json',
    ];

    const saveJournal = async (): Promise<void> => {
      await service.saveStates(journalFileNames.map((stateFileName) => ({ data: Buffer.from('{}'), stateFileName })));
    };

    it('should throw when a different lock is held, moving nothing', async () => {
      await service.lockApp();
      await saveJournal();

      await expect(service.unlockApp('other')).rejects.toThrow(new TransactionError('Invalid lock ID!'));
      await expect(stateProvider.listStates('journal.')).resolves.toEqual(journalFileNames);
    });

    it('should keep the lock and move nothing when the last journal write fails', async () => {
      const { lockId } = await service.lockApp();
      await saveJournal();
      jest.spyOn(EventService.getInstance(), 'emitAndWait').mockImplementation(async (event) => {
        if (event instanceof AppUnlockingEvent) {
          throw new Error('refused');
        }
      });

      await expect(service.unlockApp(lockId)).rejects.toThrow('refused');
      await expect(stateProvider.getAppLock()).resolves.toBe(lockId);
      await expect(stateProvider.listStates('journal.')).resolves.toEqual(journalFileNames);
    });

    it('should stop when no lock is held', async () => {
      await saveJournal();
      emitted = [];

      await service.unlockApp('gone');

      expect(emitted.map((e) => e.constructor)).toEqual([AppUnlockingEvent]);
      await expect(stateProvider.listStates('journal.')).resolves.toEqual(journalFileNames);
    });

    it('should release, then archive every journal file under the lock id', async () => {
      const { lockId } = await service.lockApp();
      await saveJournal();
      emitted = [];
      const unlockApp = jest.spyOn(stateProvider, 'unlockApp');
      const saveStates = jest.spyOn(stateProvider, 'saveStates');

      await service.unlockApp(lockId);

      expect(unlockApp.mock.invocationCallOrder[0]).toBeLessThan(saveStates.mock.invocationCallOrder[0]);
      expect(emitted.map((e) => e.constructor)).toEqual([
        AppUnlockingEvent,
        StateFilesSavingEvent,
        StateFilesSavedEvent,
        AppUnlockedEvent,
      ]);
      await expect(stateProvider.listStates('journal.')).resolves.toEqual([]);
      await expect(stateProvider.listStates('archives/')).resolves.toEqual(
        journalFileNames.map((stateFileName) => `archives/${lockId}/${stateFileName}`),
      );
      await expect(stateProvider.getAppLock()).resolves.toBeUndefined();
    });

    it('should release, reporting on stderr, when the journal cannot be archived', async () => {
      const { lockId } = await service.lockApp();
      await saveJournal();
      jest.spyOn(stateProvider, 'saveStates').mockRejectedValue(new Error('disk full'));
      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

      await service.unlockApp(lockId);

      expect(stderr).toHaveBeenCalledWith(`Failed to archive the journal of lock "${lockId}": disk full\n`);
      await expect(stateProvider.getAppLock()).resolves.toBeUndefined();
      await expect(stateProvider.listStates('journal.')).resolves.toEqual(journalFileNames);
    });
  });
});
