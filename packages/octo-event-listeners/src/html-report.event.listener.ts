import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  CommitModeCompletedEvent,
  Factory,
  ModeFailedEvent,
  ModeFinishedEvent,
  ModeStartedEvent,
  ModelTransactionTransactionEvent,
  OnEvent,
  TerraformCommandFinishedEvent,
  ValidateModeCompletedEvent,
} from '@quadnix/octo';
import { Logger } from './logger/logger.factory.js';
import { renderReportHtml } from './reporters/html/html.reporter.js';
import { type IndexRun, renderIndexHtml } from './reporters/html/index.reporter.js';
import type { OctoReport } from './reporters/report.model.js';
import { RunObserver } from './reporters/run.observer.js';

/**
 * Options for {@link HtmlReportEventListener}.
 *
 * @group Event Listeners
 */
export interface HtmlReportEventListenerOptions {
  /**
   * Where reports are written. Relative paths resolve against the process working directory.
   * Defaults to `.octo/reports`.
   */
  reportDir?: string;
}

/**
 * `20260814T105124`. Sortable, so file names order chronologically.
 */
function timestampFor(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '');
}

/**
 * Writes a browsable HTML report of each run, so that what a `validate` or `commit` concluded can be
 * read after the fact, or attached to a pull request.
 *
 * Enable it in `octo.yml` under `settings.listeners`, where `reportDir` is optional:
 *
 * ```yaml
 * settings:
 *   listeners:
 *     - type: HtmlReportEventListener
 *       reportDir: .octo/reports
 * ```
 *
 * A report is written when `validate` or `commit` finishes; `generate` and `run-action` write none.
 * Per run, into `reportDir`:
 * - `<timestamp>-<mode>.html` - the page.
 * - `<timestamp>-<mode>.json` - the same report as data.
 * - `index.html` - every report in the directory, newest first.
 *
 * It writes files only, and never to the terminal - that belongs to {@link LoggingEventListener}.
 * Both build their report from the same events, so the two cannot disagree.
 *
 * @group Event Listeners
 */
export class HtmlReportEventListener {
  private readonly logger: Logger;
  private readonly observer = new RunObserver();
  private readonly reportDir: string;

  /**
   * @param options See {@link HtmlReportEventListenerOptions}.
   */
  constructor({ reportDir }: HtmlReportEventListenerOptions = {}) {
    // Takes the process logger as it is configured. Level and destination belong to
    // `LoggingEventListener`, which owns logging; this listener only announces the file it wrote.
    this.logger = Logger.shared();
    this.reportDir = resolve(process.cwd(), reportDir ?? join('.octo', 'reports'));
  }

  /**
   * Records what the commit wrote back into state.
   */
  @OnEvent(CommitModeCompletedEvent)
  onCommitCompleted(event: CommitModeCompletedEvent): void {
    this.observer.commitCompleted(event.payload);
  }

  /**
   * A failed mode still writes a report, with the error as its first failure.
   */
  @OnEvent(ModeFailedEvent)
  async onModeFailed(event: ModeFailedEvent): Promise<void> {
    await this.writeReport(
      this.observer.finish({ durationInMs: event.payload.durationInMs, error: event.payload.error }),
    );
  }

  /**
   * Writes the report for a mode that succeeded.
   */
  @OnEvent(ModeFinishedEvent)
  async onModeFinished(event: ModeFinishedEvent): Promise<void> {
    await this.writeReport(this.observer.finish({ durationInMs: event.payload.durationInMs }));
  }

  /**
   * Records the model changes, which the report attributes resource changes to.
   */
  @OnEvent(ModelTransactionTransactionEvent)
  onModelTransaction(event: ModelTransactionTransactionEvent): void {
    this.observer.modelTransaction(event.payload);
  }

  /**
   * Begins a new report.
   */
  @OnEvent(ModeStartedEvent)
  onModeStarted(event: ModeStartedEvent): void {
    this.observer.modeStarted(event.payload);
  }

  /**
   * Accumulates time spent in terraform, which the mode's own duration does not cover.
   */
  @OnEvent(TerraformCommandFinishedEvent)
  onTerraformCommandFinished(event: TerraformCommandFinishedEvent): void {
    this.observer.terraformCommandFinished(event.payload.durationInMs);
  }

  /**
   * Records what validate concluded.
   */
  @OnEvent(ValidateModeCompletedEvent)
  onValidateCompleted(event: ValidateModeCompletedEvent): void {
    this.observer.validateCompleted(event.payload.report);
  }

  /**
   * Rebuilds `index.html` from the files on disk.
   *
   * Each row is filled in from the run's own JSON, so the index can answer "which of these was the
   * drifted one" without opening all of them. A report whose JSON is missing or unreadable — an
   * older format, or one caught mid-write — still gets its row and its links.
   */
  private async writeIndex(): Promise<void> {
    const entries = await readdir(this.reportDir);
    const runFiles: { basename: string; mode: string; timestamp: string }[] = [];

    for (const entry of entries) {
      const match = /^(.+)-(commit|validate)\.html$/.exec(entry);
      if (match) {
        runFiles.push({ basename: entry, mode: match[2], timestamp: match[1] });
      }
    }

    runFiles.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const runs: IndexRun[] = await Promise.all(
      runFiles.map(async (run) => {
        try {
          const payload = JSON.parse(
            await readFile(join(this.reportDir, run.basename.replace(/\.html$/, '.json')), 'utf-8'),
          ) as OctoReport;
          return {
            ...run,
            driftCount: payload.drift?.length ?? 0,
            headline: payload.headline,
            outcome: payload.outcome,
            totals: payload.totals,
          };
        } catch {
          return run;
        }
      }),
    );

    await writeFile(join(this.reportDir, 'index.html'), renderIndexHtml(runs), 'utf-8');
  }

  /**
   * Writes the HTML and JSON for one run, then rebuilds the index.
   */
  private async writeReport(report: OctoReport | undefined): Promise<void> {
    if (!report) {
      return;
    }

    const basename = `${timestampFor(new Date(report.startedAt))}-${report.mode}`;
    const htmlPath = join(this.reportDir, `${basename}.html`);
    const jsonPath = join(this.reportDir, `${basename}.json`);

    await mkdir(this.reportDir, { recursive: true });
    await Promise.all([
      writeFile(htmlPath, renderReportHtml(report), 'utf-8'),
      writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8'),
    ]);
    await this.writeIndex();

    this.logger.log.withMetadata({ jsonPath }).info(`Report written to ${htmlPath}`);
  }
}

/**
 * @internal
 */
@Factory<HtmlReportEventListener>(HtmlReportEventListener)
export class HtmlReportEventListenerFactory {
  private static instance: HtmlReportEventListener;
  private static instanceKey: string | undefined;

  /**
   * Called at boot with options, and again on every event dispatch with none, because `EventService`
   * resolves listeners by class name. A no-argument call returns the configured instance; new
   * options rebuild it.
   */
  static async create(options?: HtmlReportEventListenerOptions): Promise<HtmlReportEventListener> {
    if (options === undefined) {
      this.instance ??= new HtmlReportEventListener();
      return this.instance;
    }

    const key = JSON.stringify(options);
    if (!this.instance || this.instanceKey !== key) {
      this.instance = new HtmlReportEventListener(options);
      this.instanceKey = key;
    }
    return this.instance;
  }
}
