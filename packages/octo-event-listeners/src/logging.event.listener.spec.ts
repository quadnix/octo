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

  it('prints the run report when the mode finishes', async () => {
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
});
