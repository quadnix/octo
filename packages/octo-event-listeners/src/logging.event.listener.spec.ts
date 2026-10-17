import { jest } from '@jest/globals';
import {
  CommitModeCompletedEvent,
  Container,
  DiffAction,
  type DiffMetadata,
  ModeFinishedEvent,
  ModeStartedEvent,
  ModelTransactionTransactionEvent,
  TerraformCommandFinishedEvent,
  TerraformProcessExitedEvent,
  TerraformProcessOutputEvent,
  TerraformProcessStartedEvent,
  ValidateModeCompletedEvent,
} from '@quadnix/octo';
import { Logger } from './logger/logger.factory.js';
import { LoggingEventListener, type LoggingEventListenerFactory } from './logging.event.listener.js';

/**
 * `EventService` is octo-internal, so it is resolved from the container by name.
 */
interface TestEventService {
  emit(event: unknown): void;
  emitAndWait(event: unknown): Promise<void>;
}

const modelDiff = (): DiffMetadata =>
  ({
    action: DiffAction.ADD,
    diff: {},
    field: 'serviceId',
    node: { getContext: () => 'service=my-site,app=test-app' },
    outputs: { 0: { getContext: () => '@octo/s3-website=bucket-site' } },
  }) as unknown as DiffMetadata;

const validateReport = (): ValidateModeCompletedEvent['payload']['report'] => ({
  attributedChanges: [],
  confidence: 'approximate',
  dataLoss: [],
  drift: [],
  failures: [],
  intentChanges: [
    {
      moduleId: 'website-module',
      octoAction: DiffAction.ADD,
      resourceContext: '@octo/s3-website=bucket-site',
      resourceId: 'bucket-site',
      terraformChanges: [{ address: 'aws_s3_bucket.site', changedFields: [], tfActions: ['create'] }],
    },
  ],
  moves: [],
  notes: [],
  uncertain: [],
});

/**
 * Covers the report the logger prints. The narrative lines around it go through `withMetadata()`,
 * which returns a child logger; the report is logged on the logger itself, so spying there captures
 * the report and nothing else.
 */
describe('LoggingEventListener UT', () => {
  let eventService: TestEventService;
  let infoSpy: jest.SpiedFunction<(message: string) => unknown>;

  beforeEach(async () => {
    const container = Container.getInstance();
    await container.get<LoggingEventListener, typeof LoggingEventListenerFactory>(LoggingEventListener, {
      args: [{ colorize: false, level: 'info' }],
    });
    eventService = (await container.get('EventService')) as TestEventService;

    infoSpy = jest.spyOn(Logger.shared().log, 'info').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const printed = (): string => infoSpy.mock.calls.map(([message]) => String(message)).join('\n');

  const runValidate = async (): Promise<void> => {
    eventService.emit(new ModeStartedEvent('validate', { appName: 'test-app', mode: 'validate' }));
    eventService.emit(new ModelTransactionTransactionEvent(undefined as never, [[modelDiff()]]));
    eventService.emit(new ValidateModeCompletedEvent(undefined, { report: validateReport() }));
    await eventService.emitAndWait(
      new ModeFinishedEvent('validate', { appName: 'test-app', durationInMs: 1200, mode: 'validate' }),
    );
  };

  it('prints the report when the mode finishes', async () => {
    await runValidate();

    expect(printed()).toContain('test-app — octo validate');
    expect(printed()).toContain('WHAT WILL CHANGE');
    // The intent layer: named after what was edited, not after the module that rendered it.
    expect(printed()).toContain('added service=my-site');
  });

  it('counts terraform time that ran before the mode started', async () => {
    eventService.emit(
      new TerraformCommandFinishedEvent('plan', { command: 'plan', dir: '/tmp/a', durationInMs: 36_100, exitCode: 0 }),
    );
    await runValidate();

    expect(printed()).toContain('36.1s terraform');
  });

  it('prints no report for a mode that produces none', async () => {
    eventService.emit(new ModeStartedEvent('generate', { appName: 'test-app', mode: 'generate' }));
    await eventService.emitAndWait(
      new ModeFinishedEvent('generate', { appName: 'test-app', durationInMs: 12, mode: 'generate' }),
    );

    expect(printed()).not.toContain('WHAT WILL CHANGE');
  });

  it('reports a commit from the same events', async () => {
    eventService.emit(new ModeStartedEvent('commit', { appName: 'test-app', mode: 'commit' }));
    eventService.emit(
      new CommitModeCompletedEvent(undefined, {
        emptiedModuleIds: ['old-website-module'],
        resources: [],
        responses: [],
        warnings: [],
      } as never),
    );
    await eventService.emitAndWait(
      new ModeFinishedEvent('commit', { appName: 'test-app', durationInMs: 900, mode: 'commit' }),
    );

    expect(printed()).toContain('MODULES THAT NO LONGER RENDER ANYTHING');
    expect(printed()).toContain('old-website-module');
  });

  describe('terraform output', () => {
    let lines: [string, Record<string, unknown>, string][];

    beforeEach(() => {
      lines = [];
      const record =
        (level: string, metadata: Record<string, unknown>) =>
        (message: string): void => {
          lines.push([level, metadata, message]);
        };
      jest.spyOn(Logger.shared().log, 'withMetadata').mockImplementation(
        (metadata) =>
          ({
            debug: record('debug', metadata as Record<string, unknown>),
            info: record('info', metadata as Record<string, unknown>),
          }) as never,
      );
    });

    const startProcess = (processId: number, args: string[]): void => {
      eventService.emit(
        new TerraformProcessStartedEvent(args[0], { args, binary: 'terragrunt', dir: '/tf', processId }),
      );
    };

    it('prints each whole line a process wrote, tagged with its process and stream', async () => {
      startProcess(1, ['apply']);
      eventService.emit(new TerraformProcessOutputEvent('apply', { processId: 1, stream: 'stdout', text: 'Creat' }));
      eventService.emit(
        new TerraformProcessOutputEvent('apply', { processId: 1, stream: 'stdout', text: 'ing...\nDone' }),
      );
      eventService.emit(new TerraformProcessOutputEvent('apply', { processId: 1, stream: 'stderr', text: 'warn\n' }));
      await eventService.emitAndWait(new TerraformProcessExitedEvent('apply', { exitCode: 0, processId: 1 }));

      expect(lines.filter(([level]) => level === 'info')).toEqual([
        ['info', { command: 'apply', processId: 1, stream: 'stdout' }, 'Creating...'],
        ['info', { command: 'apply', processId: 1, stream: 'stderr' }, 'warn'],
        ['info', { command: 'apply', processId: 1, stream: 'stdout' }, 'Done'],
      ]);
    });

    it('ignores the JSON a process asked for JSON wrote, and prints its stderr', async () => {
      startProcess(2, ['show', '-json', 'plan']);
      eventService.emit(new TerraformProcessOutputEvent('show', { processId: 2, stream: 'stdout', text: '{"a":' }));
      eventService.emit(new TerraformProcessOutputEvent('show', { processId: 2, stream: 'stderr', text: 'warn\n' }));
      await eventService.emitAndWait(new TerraformProcessExitedEvent('show', { exitCode: 0, processId: 2 }));

      expect(lines.filter(([, metadata]) => 'stream' in metadata)).toEqual([
        ['info', { command: 'show', processId: 2, stream: 'stderr' }, 'warn'],
      ]);
    });
  });
});
