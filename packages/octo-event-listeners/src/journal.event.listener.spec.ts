import { existsSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { jest } from '@jest/globals';
import {
  AppLockError,
  CommandFailedEvent,
  CommandFinishedEvent,
  CommandStartedEvent,
  Container,
  Event,
  ModeFinishedEvent,
  ModeStartedEvent,
  ModuleEvent,
  StateManagementService,
  TerraformProcessExitedEvent,
  TerraformProcessOutputEvent,
  TerraformProcessStartedEvent,
  TestStateProvider,
} from '@quadnix/octo';
import {
  JournalEventListener,
  JournalEventListenerFactory,
  type JournalFile,
  type TerraformLogFile,
} from './journal.event.listener.js';

/**
 * `EventService` is octo-internal, so it is resolved from the container by name.
 */
interface TestEventService {
  emit(event: unknown): void;
  emitAndWait(event: unknown): Promise<void>;
}

const COMMAND_FILE_NAME = /^journal\.\d{13}-[0-9a-f]{8}\.[a-z-]+\.json$/;

describe('JournalEventListener UT', () => {
  let eventService: TestEventService;
  let stateManagementService: StateManagementService;
  let stateProvider: TestStateProvider;

  // Starts a new command, as a new process would.
  const startCommand = async (): Promise<void> => {
    (JournalEventListenerFactory as unknown as { instance: JournalEventListener | undefined }).instance = undefined;
    await Container.getInstance().get(JournalEventListener);
  };

  const finishCommand = async (command: string): Promise<void> => {
    await eventService.emitAndWait(new CommandFinishedEvent(undefined, { command, durationInMs: 1 }));
  };

  const runCommand = async (command: string): Promise<void> => {
    eventService.emit(new CommandStartedEvent(undefined, { command }));
    await finishCommand(command);
  };

  const readJson = async (stateFileName: string): Promise<any> =>
    JSON.parse((await stateProvider.getState(stateFileName)).toString());

  beforeEach(async () => {
    stateProvider = new TestStateProvider();
    stateManagementService = await Container.getInstance().get<StateManagementService, any>(StateManagementService, {
      args: [stateProvider],
    });
    eventService = (await Container.getInstance().get('EventService')) as TestEventService;

    delete process.env.OCTO_JOURNAL_COMMAND_ID;
    await startCommand();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onEvent()', () => {
    it('should not fail the command when the journal cannot be written', async () => {
      jest.spyOn(stateProvider, 'saveStates').mockRejectedValue(new Error('refused'));
      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

      await expect(runCommand('generate')).resolves.toBeUndefined();
      expect(stderr).toHaveBeenCalledWith('journal: refused\n');
    });

    it('should write one file per command, holding every event in the order it happened', async () => {
      eventService.emit(new CommandStartedEvent(undefined, { command: 'generate' }));
      eventService.emit(new ModeStartedEvent('generate', { appName: 'app', mode: 'generate' }));
      await eventService.emitAndWait(
        new ModeFinishedEvent('generate', { appName: 'app', durationInMs: 1, mode: 'generate' }),
      );
      await finishCommand('generate');

      const [commandFileName] = await stateProvider.listStates('journal.');
      const commandFile = await readJson(commandFileName);
      expect(commandFileName).toBe(`journal.${commandFile.commandId}.generate.json`);
      expect(commandFileName).toMatch(COMMAND_FILE_NAME);
      expect(commandFile).toMatchObject({ command: 'generate', host: expect.any(String), version: 1 });
      expect(commandFile.entries.map((e: { type: string }) => e.type)).toEqual([
        'CommandStartedEvent',
        'ModeStartedEvent',
        'ModeFinishedEvent',
        'CommandFinishedEvent',
      ]);
      expect(commandFile.entries[0].payload).toEqual({ command: 'generate' });
    });

    it('should record the inputs each module ran with, naming a model it was given', async () => {
      eventService.emit(
        new ModuleEvent('AwsIniAccountModule', {
          inputs: { accountId: '123456789012', app: { getContext: (): string => 'app=shop' } },
          moduleId: 'account-module',
        }),
      );
      await runCommand('generate');

      const [commandFileName] = await stateProvider.listStates('journal.');
      const entry = (await readJson(commandFileName)).entries.find((e: { type: string }) => e.type === 'ModuleEvent');
      expect(entry).toMatchObject({
        name: 'AwsIniAccountModule',
        payload: { inputs: { accountId: '123456789012', app: 'app=shop' }, moduleId: 'account-module' },
      });
    });

    it('should record the error a command failed with, with the fields its class names', async () => {
      eventService.emit(new CommandStartedEvent(undefined, { command: 'generate' }));
      await eventService.emitAndWait(
        new CommandFailedEvent(undefined, {
          command: 'generate',
          durationInMs: 1,
          error: new AppLockError('App is locked!', { holder: { lockId: 'lock-1' }, reason: 'held' }),
        }),
      );

      const [commandFileName] = await stateProvider.listStates('journal.');
      const commandFile: JournalFile = await readJson(commandFileName);
      expect(commandFile.entries.find((e) => e.type === 'CommandFailedEvent')?.payload).toEqual({
        command: 'generate',
        durationInMs: 1,
        error: { className: 'AppLockError', holder: { lockId: 'lock-1' }, message: 'App is locked!', reason: 'held' },
      });
    });

    it('should record any other error by its name and message', async () => {
      eventService.emit(new CommandStartedEvent(undefined, { command: 'generate' }));
      await eventService.emitAndWait(
        new CommandFailedEvent(undefined, { command: 'generate', durationInMs: 1, error: new TypeError('bad') }),
      );

      const [commandFileName] = await stateProvider.listStates('journal.');
      const commandFile: JournalFile = await readJson(commandFileName);
      expect(commandFile.entries.find((e) => e.type === 'CommandFailedEvent')?.payload).toMatchObject({
        error: { message: 'bad', name: 'TypeError' },
      });
    });

    it('should leave out an event of a class it does not record', async () => {
      class SomeLibraryEvent extends Event<{ value: string }> {}
      eventService.emit(new SomeLibraryEvent(undefined, { value: 'a' }));
      await runCommand('generate');

      const [commandFileName] = await stateProvider.listStates('journal.');
      const commandFile: JournalFile = await readJson(commandFileName);
      expect(commandFile.entries.map((e) => e.type)).toEqual(['CommandStartedEvent', 'CommandFinishedEvent']);
    });

    it('should copy each version of a graph file once, and mark every file written', async () => {
      eventService.emit(new CommandStartedEvent(undefined, { command: 'generate' }));
      await stateManagementService.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'models.json' }]);
      await stateManagementService.saveStates([{ data: Buffer.from('{"a":1}'), stateFileName: 'models.json' }]);
      await stateManagementService.saveStates([{ data: Buffer.from('{"a":2}'), stateFileName: 'models.json' }]);
      await stateManagementService.saveStates([{ data: Buffer.from('{}'), stateFileName: 'web.tfstate' }]);
      await finishCommand('generate');

      const journalFileNames = await stateProvider.listStates('journal.');
      expect(journalFileNames.filter((n) => /\.generate\.[0-9a-f]{32}\.json$/.test(n))).toHaveLength(2);
      const commandFile = await readJson(journalFileNames.find((n) => COMMAND_FILE_NAME.test(n))!);
      expect(
        commandFile.entries
          .filter((e: { type: string }) => e.type === 'StateFilesSavedEvent')
          .map((e: { payload: { stateFiles: { stateFileName: string }[] } }) => e.payload.stateFiles[0].stateFileName),
      ).toEqual(['models.json', 'models.json', 'models.json', 'web.tfstate']);
    });

    it('should keep every process terraform ran in the terraform log, the output of a JSON command included', async () => {
      await stateManagementService.lockApp();
      eventService.emit(new CommandStartedEvent(undefined, { command: 'apply' }));
      eventService.emit(
        new TerraformProcessStartedEvent('apply', { args: ['apply'], binary: 'terragrunt', dir: '/tf', processId: 1 }),
      );
      eventService.emit(
        new TerraformProcessOutputEvent('apply', { processId: 1, stream: 'stdout', text: 'Applying...' }),
      );
      eventService.emit(
        new TerraformProcessOutputEvent('apply', { processId: 1, stream: 'stderr', text: 'Error: bad' }),
      );
      eventService.emit(new TerraformProcessExitedEvent('apply', { exitCode: 1, processId: 1 }));
      eventService.emit(
        new TerraformProcessStartedEvent('show', {
          args: ['show', '-json', 'plan'],
          binary: 'terragrunt',
          dir: '/tf/a',
          processId: 2,
        }),
      );
      eventService.emit(new TerraformProcessOutputEvent('show', { processId: 2, stream: 'stdout', text: '{"a":1}' }));
      eventService.emit(new TerraformProcessExitedEvent('show', { exitCode: 0, processId: 2 }));
      await finishCommand('apply');

      const [logFileName] = (await stateProvider.listStates('journal.')).filter((n) => n.endsWith('.terraform.json'));
      expect(logFileName).toMatch(/^journal\.[^.]+\.apply\.terraform\.json$/);
      const log: TerraformLogFile = await readJson(logFileName);
      expect(log).toMatchObject({ command: 'apply', version: 1 });
      expect(log.outputs.map(({ sequence, time, ...record }) => record)).toEqual([
        { args: ['apply'], binary: 'terragrunt', dir: '/tf', process: 1, type: 'started' },
        { process: 1, stream: 'stdout', text: 'Applying...', type: 'output' },
        { process: 1, stream: 'stderr', text: 'Error: bad', type: 'output' },
        { exitCode: 1, process: 1, type: 'exited' },
        { args: ['show', '-json', 'plan'], binary: 'terragrunt', dir: '/tf/a', process: 2, type: 'started' },
        { process: 2, stream: 'stdout', text: '{"a":1}', type: 'output' },
        { exitCode: 0, process: 2, type: 'exited' },
      ]);
    });

    it('should keep nothing in the terraform log before a command is named', async () => {
      eventService.emit(new TerraformProcessOutputEvent('apply', { processId: 1, stream: 'stdout', text: 'early' }));
      await runCommand('generate');

      expect((await stateProvider.listStates('journal.')).filter((n) => n.endsWith('.terraform.json'))).toEqual([]);
    });

    it('should carry the terraform log as it stands at every save before the command ends', async () => {
      await stateManagementService.lockApp();
      eventService.emit(new CommandStartedEvent(undefined, { command: 'apply' }));
      eventService.emit(
        new TerraformProcessStartedEvent('apply', { args: ['apply'], binary: 'terragrunt', dir: '/tf', processId: 1 }),
      );
      const readLog = async (): Promise<any> => {
        const [logFileName] = (await stateProvider.listStates('journal.')).filter((n) => n.endsWith('.terraform.json'));
        return readJson(logFileName);
      };

      eventService.emit(new TerraformProcessOutputEvent('apply', { processId: 1, stream: 'stdout', text: 'a' }));
      await stateManagementService.saveStates([{ data: Buffer.from('{}'), stateFileName: 'web.tfstate' }]);
      expect((await readLog()).outputs.map((record: { type: string }) => record.type)).toEqual(['started', 'output']);

      eventService.emit(new TerraformProcessOutputEvent('apply', { processId: 1, stream: 'stdout', text: 'b' }));
      await stateManagementService.saveStates([{ data: Buffer.from('{}'), stateFileName: 'web.tfstate' }]);
      expect((await readLog()).outputs.map((record: { text?: string }) => record.text)).toEqual([undefined, 'a', 'b']);
    });

    it('should delete the terraform log file when the command ends', async () => {
      await stateManagementService.lockApp();
      eventService.emit(new CommandStartedEvent(undefined, { command: 'apply' }));
      eventService.emit(new TerraformProcessOutputEvent('apply', { processId: 1, stream: 'stdout', text: 'a' }));
      await stateManagementService.saveStates([{ data: Buffer.from('{}'), stateFileName: 'web.tfstate' }]);
      const listener = await Container.getInstance().get(JournalEventListener);
      const { filePath } = (listener as unknown as { terraformLog: { filePath: string } }).terraformLog;
      expect(existsSync(filePath)).toBe(true);

      await finishCommand('apply');

      expect(existsSync(filePath)).toBe(false);
    });

    it('should hand a save a copy of the terraform log by its path, and delete the copy once saved', async () => {
      await stateManagementService.lockApp();
      const saveStates = jest.spyOn(stateProvider, 'saveStates');
      eventService.emit(new CommandStartedEvent(undefined, { command: 'apply' }));
      eventService.emit(new TerraformProcessOutputEvent('apply', { processId: 1, stream: 'stdout', text: 'a' }));

      await stateManagementService.saveStates([{ data: Buffer.from('{}'), stateFileName: 'web.tfstate' }]);

      const logStateFile = saveStates.mock.calls[0][0].find((f) => f.stateFileName.endsWith('.terraform.json'))!;
      expect(logStateFile).toEqual({
        filePath: expect.stringMatching(/snapshot-1\.json$/),
        stateFileName: expect.any(String),
      });
      const { filePath } = logStateFile as { filePath: string };
      // The copy is deleted when the saved event reaches the listener, which is not awaited.
      for (let attempt = 0; attempt < 50 && existsSync(filePath); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(existsSync(filePath)).toBe(false);
      expect(readdirSync(dirname(filePath))).toEqual(['terraform.json']);
    });

    it('should name the command of the process that started it', async () => {
      const listener = await Container.getInstance().get(JournalEventListener);
      const parentCommandId = (listener as unknown as { commandId: string }).commandId;
      expect(process.env.OCTO_JOURNAL_COMMAND_ID).toBe(parentCommandId);

      await startCommand();
      await stateManagementService.lockApp();
      await runCommand('run-action');

      const [journalFileName] = await stateProvider.listStates('journal.');
      expect(await readJson(journalFileName)).toMatchObject({ command: 'run-action', parentCommandId });
    });

    it('should name each mode a command of its own where no command runs it', async () => {
      await stateManagementService.lockApp();
      eventService.emit(new ModeStartedEvent('generate', { appName: 'app', mode: 'generate' }));
      await eventService.emitAndWait(
        new ModeFinishedEvent('generate', { appName: 'app', durationInMs: 1, mode: 'generate' }),
      );
      eventService.emit(new ModeStartedEvent('commit', { appName: 'app', mode: 'commit' }));
      await eventService.emitAndWait(
        new ModeFinishedEvent('commit', { appName: 'app', durationInMs: 1, mode: 'commit' }),
      );

      const journalFileNames = await stateProvider.listStates('journal.');
      expect(journalFileNames.map((n) => n.split('.')[2]).sort()).toEqual(['commit', 'generate']);
      expect(new Set(journalFileNames.map((n) => n.split('.')[1])).size).toBe(2);
      const commitFile = await readJson(journalFileNames.find((n) => n.includes('.commit.'))!);
      expect(commitFile.entries.map((e: { type: string }) => e.type)).toEqual(
        expect.arrayContaining(['ModeStartedEvent', 'ModeFinishedEvent']),
      );
      expect(commitFile.entries.map((e: { type: string }) => e.type)).not.toContain('CommandStartedEvent');
    });

    it('should write nothing for a command that runs under a lock when no lock is held', async () => {
      const saveStates = jest.spyOn(stateProvider, 'saveStates');
      eventService.emit(new CommandStartedEvent(undefined, { command: 'apply' }));

      await stateManagementService.saveStates([{ data: Buffer.from('{}'), stateFileName: 'web.tfstate' }]);
      await finishCommand('apply');

      expect(saveStates).toHaveBeenCalledTimes(1);
      expect(saveStates.mock.calls[0][0].map((f) => f.stateFileName)).toEqual(['web.tfstate']);
      expect(await stateProvider.listStates('journal.')).toEqual([]);
    });

    it('should write for a command that runs before a lock when no lock is held', async () => {
      await runCommand('validate');

      expect(await stateProvider.listStates('journal.')).toEqual([
        expect.stringMatching(/^journal\.[^.]+\.validate\.json$/),
      ]);
    });

    it('should add its files to a state save', async () => {
      await stateManagementService.lockApp();
      const saveStates = jest.spyOn(stateProvider, 'saveStates');
      eventService.emit(new CommandStartedEvent(undefined, { command: 'apply' }));

      await stateManagementService.saveStates([{ data: Buffer.from('{}'), stateFileName: 'web.tfstate' }]);

      expect(saveStates).toHaveBeenCalledTimes(1);
      expect(saveStates.mock.calls[0][0].map((f) => f.stateFileName)).toEqual([
        'web.tfstate',
        expect.stringMatching(/^journal\.[^.]+\.apply\.json$/),
      ]);
    });

    it('should not add its files to a save before a command begins', async () => {
      const saveStates = jest.spyOn(stateProvider, 'saveStates');

      await stateManagementService.saveStates([{ data: Buffer.from('{}'), stateFileName: 'web.tfstate' }]);

      expect(saveStates.mock.calls[0][0].map((f) => f.stateFileName)).toEqual(['web.tfstate']);
    });

    it('should fail the release when the last write fails', async () => {
      eventService.emit(new CommandStartedEvent(undefined, { command: 'commit' }));
      const { lockId } = await stateManagementService.lockApp();
      jest.spyOn(stateProvider, 'saveStates').mockRejectedValue(new Error('refused'));

      await expect(stateManagementService.unlockApp(lockId)).rejects.toThrow('refused');
      expect(await stateProvider.getAppLock()).toBe(lockId);
    });

    it('should write nothing after the release', async () => {
      eventService.emit(new CommandStartedEvent(undefined, { command: 'commit' }));
      const { lockId } = await stateManagementService.lockApp();
      await stateManagementService.unlockApp(lockId);
      const saveStates = jest.spyOn(stateProvider, 'saveStates');

      await stateManagementService.saveStates([{ data: Buffer.from('{}'), stateFileName: 'web.tfstate' }]);
      await finishCommand('commit');

      expect(saveStates).toHaveBeenCalledTimes(1);
      expect(saveStates.mock.calls[0][0].map((f) => f.stateFileName)).toEqual(['web.tfstate']);
    });
  });
});
