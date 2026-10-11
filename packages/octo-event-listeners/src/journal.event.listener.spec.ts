import { jest } from '@jest/globals';
import {
  CommandFinishedEvent,
  CommandStartedEvent,
  Container,
  ModeFinishedEvent,
  ModeStartedEvent,
  ModuleEvent,
  StateManagementService,
  TerraformCommandOutputEvent,
  TestStateProvider,
} from '@quadnix/octo';
import { JournalEventListener, JournalEventListenerFactory } from './journal.event.listener.js';

/**
 * `EventService` is octo-internal, so it is resolved from the container by name.
 */
interface TestEventService {
  emit(event: unknown): void;
  emitAndWait(event: unknown): Promise<void>;
}

const COMMAND_FILE_NAME = /^journal\.\d{8}T\d{9}Z-[0-9a-f]{8}\.[a-z-]+\.json$/;

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
      expect(commandFile).not.toHaveProperty('cycleId');
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

    it('should keep what terraform wrote in the terraform log, without the output of a JSON command', async () => {
      await stateManagementService.lockApp();
      eventService.emit(new CommandStartedEvent(undefined, { command: 'apply' }));
      eventService.emit(
        new TerraformCommandOutputEvent('apply', {
          args: ['apply'],
          binary: 'terragrunt',
          dir: '/tf',
          exitCode: 1,
          stderr: 'Error: bad',
          stdout: 'Applying...',
        }),
      );
      eventService.emit(
        new TerraformCommandOutputEvent('show', {
          args: ['show', '-json', 'plan'],
          binary: 'terragrunt',
          dir: '/tf/a',
          exitCode: 0,
          stderr: '',
          stdout: '{"resource_changes":[]}',
        }),
      );
      await finishCommand('apply');

      const [logFileName] = (await stateProvider.listStates('journal.')).filter((n) => n.endsWith('.terraform.json'));
      expect(logFileName).toMatch(/^journal\.[^.]+\.apply\.terraform\.json$/);
      const log = await readJson(logFileName);
      expect(log.outputs).toEqual([
        expect.objectContaining({ exitCode: 1, stderr: 'Error: bad', stdout: 'Applying...' }),
        expect.objectContaining({ args: ['show', '-json', 'plan'], stderr: '' }),
      ]);
      expect(log.outputs[1]).not.toHaveProperty('stdout');
    });

    it('should name each mode a command of its own where no command runs it', async () => {
      await stateManagementService.lockApp();
      eventService.emit(new ModeStartedEvent('generate', { appName: 'app', mode: 'generate' }));
      await eventService.emitAndWait(
        new ModeFinishedEvent('generate', { appName: 'app', durationInMs: 1, mode: 'generate' }),
      );
      eventService.emit(new ModeStartedEvent('commit', { appName: 'app', mode: 'commit' }));
      await eventService.emitAndWait(new ModeFinishedEvent('commit', { appName: 'app', durationInMs: 1, mode: 'commit' }));

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
