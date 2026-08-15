import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CommitModeCompletedEvent,
  Container,
  DiffAction,
  type DiffMetadata,
  ModeFailedEvent,
  ModeFinishedEvent,
  ModeStartedEvent,
  ModelTransactionTransactionEvent,
  ValidateModeCompletedEvent,
} from '@quadnix/octo';
import { HtmlReportEventListener, type HtmlReportEventListenerFactory } from './html-report.event.listener.js';

/**
 * `EventService` is octo-internal, so it is resolved from the container by name.
 */
interface TestEventService {
  emit(event: unknown): void;
  emitAndWait(event: unknown): Promise<void>;
}

/**
 * Covers the event wiring. `report.builder.spec.ts` covers what the report says.
 */
describe('HtmlReportEventListener', () => {
  let eventService: TestEventService;
  let reportDir: string;

  beforeEach(async () => {
    reportDir = await mkdtemp(join(tmpdir(), 'octo-report-'));

    const container = Container.getInstance();
    await container.get<HtmlReportEventListener, typeof HtmlReportEventListenerFactory>(HtmlReportEventListener, {
      args: [{ reportDir }],
    });

    eventService = (await container.get('EventService')) as TestEventService;
  });

  const modelDiff = (): DiffMetadata =>
    ({
      action: DiffAction.ADD,
      diff: {},
      field: 'serviceId',
      node: { getContext: () => 'service=my-site,app=test-app' },
      outputs: { 0: { getContext: () => '@octo/s3-website=bucket-site' } },
    }) as unknown as DiffMetadata;

  const emitValidateRun = async (): Promise<void> => {
    eventService.emit(new ModeStartedEvent('validate', { appName: 'test-app', mode: 'validate' }));
    eventService.emit(new ModelTransactionTransactionEvent(undefined as never, [[modelDiff()]]));
    eventService.emit(
      new ValidateModeCompletedEvent(undefined, {
        report: {
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
              terraformChanges: [{ address: 'aws_s3_bucket.site', tfActions: ['create'] }],
            },
          ],
          notes: [],
          uncertain: [],
        },
      }),
    );
    await eventService.emitAndWait(
      new ModeFinishedEvent('validate', { appName: 'test-app', durationInMs: 1200, mode: 'validate' }),
    );
  };

  it('writes nothing until the mode finishes', async () => {
    eventService.emit(new ModeStartedEvent('validate', { appName: 'test-app', mode: 'validate' }));
    eventService.emit(new ModelTransactionTransactionEvent(undefined as never, [[modelDiff()]]));

    expect(await readdir(reportDir)).toEqual([]);
  });

  it('writes an html page, a json payload and an index when the mode finishes', async () => {
    await emitValidateRun();

    const entries = (await readdir(reportDir)).sort();
    expect(entries).toHaveLength(3);
    expect(entries).toContain('index.html');
    expect(entries.some((entry) => /^\d{8}T\d{6}-validate\.html$/.test(entry))).toBe(true);
    expect(entries.some((entry) => /^\d{8}T\d{6}-validate\.json$/.test(entry))).toBe(true);
  });

  it('assembles the report from events emitted across the whole mode', async () => {
    await emitValidateRun();

    const jsonName = (await readdir(reportDir)).find((entry) => entry.endsWith('.json'))!;
    const report = JSON.parse(await readFile(join(reportDir, jsonName), 'utf-8'));

    // Each field below arrived on a different event.
    expect(report.app).toBe('test-app'); // ModeStartedEvent
    expect(report.durationInMs).toBe(1200); // ModeFinishedEvent
    expect(report.confidence).toBe('approximate'); // ValidateModeCompletedEvent
    expect(report.stories[0].title).toBe('added service=my-site'); // ModelTransactionTransactionEvent
    expect(report.stories[0].moduleId).toBe('website-module'); // ValidateModeCompletedEvent
    expect(report.stories[0].resources[0].resourceId).toBe('bucket-site'); // ValidateModeCompletedEvent
  });

  it('produces a self-contained page with no external requests', async () => {
    await emitValidateRun();

    const htmlName = (await readdir(reportDir)).find((entry) => entry.endsWith('-validate.html'))!;
    const html = await readFile(join(reportDir, htmlName), 'utf-8');

    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain('added service=my-site');
  });

  it('still writes a report when the mode failed', async () => {
    eventService.emit(new ModeStartedEvent('validate', { appName: 'test-app', mode: 'validate' }));
    await eventService.emitAndWait(
      new ModeFailedEvent('validate', {
        appName: 'test-app',
        durationInMs: 30,
        error: 'state provider unreachable',
        mode: 'validate',
      }),
    );

    const jsonName = (await readdir(reportDir)).find((entry) => entry.endsWith('.json'))!;
    const report = JSON.parse(await readFile(join(reportDir, jsonName), 'utf-8'));

    expect(report.outcome).toBe('failed');
    expect(report.failures[0].message).toBe('state provider unreachable');
  });

  it('writes no report for generate, which has nothing to report on', async () => {
    eventService.emit(new ModeStartedEvent('generate', { appName: 'test-app', mode: 'generate' }));
    await eventService.emitAndWait(
      new ModeFinishedEvent('generate', { appName: 'test-app', durationInMs: 10, mode: 'generate' }),
    );

    expect(await readdir(reportDir)).toEqual([]);
  });

  it("does not leak one mode's events into the next report", async () => {
    await emitValidateRun();

    eventService.emit(new ModeStartedEvent('commit', { appName: 'test-app', mode: 'commit' }));
    eventService.emit(
      new CommitModeCompletedEvent(undefined, { emptiedModuleIds: [], resources: [], responses: [], warnings: [] }),
    );
    await eventService.emitAndWait(
      new ModeFinishedEvent('commit', { appName: 'test-app', durationInMs: 5, mode: 'commit' }),
    );

    const commitJson = (await readdir(reportDir)).find((entry) => entry.endsWith('-commit.json'))!;
    const report = JSON.parse(await readFile(join(reportDir, commitJson), 'utf-8'));

    // The validate run must not survive into the commit report.
    expect(report.stories).toEqual([]);
    expect(report.outcome).toBe('clean');
  });
});
