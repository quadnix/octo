import {
  ActionEvent,
  ActualResourceSerializedEvent,
  AnchorRegistrationEvent,
  CommitModeCompletedEvent,
  type DiffMetadata,
  type Event,
  Factory,
  HookEvent,
  ImportedStateChangedEvent,
  ModeEvent,
  ModeFailedEvent,
  ModeFinishedEvent,
  ModeResultEvent,
  ModeStartedEvent,
  ModelActionRegistrationEvent,
  ModelActionTransactionEvent,
  ModelDeserializedEvent,
  ModelDiffsTransactionEvent,
  ModelRegistrationEvent,
  ModelSerializedEvent,
  ModelTransactionTransactionEvent,
  ModuleEvent,
  NewResourceSerializedEvent,
  OnEvent,
  OverlayRegistrationEvent,
  PostCommitHookCallbackDoneEvent,
  PostModelActionHookCallbackDoneEvent,
  PostResourceActionHookCallbackDoneEvent,
  PreCommitHookCallbackDoneEvent,
  PreModelActionHookCallbackDoneEvent,
  PreResourceActionHookCallbackDoneEvent,
  RegistrationEvent,
  ResourceActionCompletedTransactionEvent,
  ResourceActionInitiatedTransactionEvent,
  ResourceActionRegistrationEvent,
  ResourceActionSummaryTransactionEvent,
  ResourceDeserializedEvent,
  ResourceDiffsTransactionEvent,
  ResourceRegistrationEvent,
  ResourceTransactionTransactionEvent,
  RunActionModeCompletedEvent,
  SerializationEvent,
  TerraformCommandFinishedEvent,
  TerraformCommandStartedEvent,
  TerraformEvent,
  TerraformFoldersWrittenEvent,
  TerraformProcessExitedEvent,
  TerraformProcessOutputEvent,
  TerraformProcessStartedEvent,
  TransactionEvent,
  ValidateModeCompletedEvent,
} from '@quadnix/octo';
import type { EventPayloads, JournalEntry } from './journal.event.listener.js';
import { Logger, type LoggerOptions } from './logger/logger.factory.js';
import { RunObserver } from './reporters/run.observer.js';
import { renderReportText } from './reporters/text/text.reporter.js';
import { JournalUtility } from './utilities/journal/journal.utility.js';
import { EventWordingUtility, type WordingContext } from './utilities/wording/event-wording.utility.js';

/**
 * Logs octo's event stream to the terminal. This is what turns a silent run into a readable one.
 *
 * Enable it in `octo.yml` under `settings.listeners`, where `level` and `colorize` are optional:
 *
 * ```yaml
 * settings:
 *   listeners:
 *     - type: LoggingEventListener
 *       level: info
 * ```
 *
 * Levels, each including the ones above it:
 *
 * - `error` - a mode failed.
 * - `warn`  - drift, commit warnings, a non-zero terraform exit.
 * - `info`  - mode boundaries, folders written, terraform commands and every line they print,
 *             mode results, SDK resource actions, author `log()` calls, and the mode's report in full.
 * - `debug` - diffs, transactions, serialization, hooks, terraform processes starting and exiting.
 *
 * The JSON a terraform process asked for JSON prints is data octo reads, and is never printed.
 * - `trace` - class registration.
 *
 * @group Event Listeners
 */
export class LoggingEventListener {
  /**
   * Collects the mode so it can be closed with the whole report, not just a count.
   */
  private readonly observer = new RunObserver();
  /**
   * Start times of in-flight resource actions, used to report their duration on completion.
   */
  private readonly resourceActionStartedAt: Map<string, number> = new Map();
  /**
   * Terraform time since the last mode finished, which that mode's own duration does not cover.
   */
  private terraformInMs = 0;
  /**
   * Every running terraform process, with the end of each stream not yet printed because it is not a whole line.
   */
  private readonly terraformProcesses = new Map<
    number,
    { command: string; isJson: boolean; partialLines: { stderr: string; stdout: string } }
  >();

  /**
   * @param logger The process logger, whose level and destination this listener owns.
   */
  constructor(private readonly logger: Logger) {}

  /**
   * An author's own `log()` call from inside an action.
   */
  @OnEvent(ActionEvent)
  onAction(event: ActionEvent): void {
    this.logWorded(event);
  }

  /**
   * A registered hook callback finished.
   */
  @OnEvent(HookEvent)
  onHook(event: HookEvent): void {
    this.logWorded(event);
  }

  /**
   * Another app this one stands on moved on since this app's last commit.
   */
  @OnEvent(ImportedStateChangedEvent)
  onImportedStateChanged(event: ImportedStateChangedEvent): void {
    this.logWorded(event);
  }

  /**
   * Mode boundaries, and the only path by which a mode failure reaches a listener.
   */
  @OnEvent(ModeEvent)
  onMode(event: ModeEvent): void {
    if (event instanceof ModeStartedEvent) {
      this.observer.modeStarted(event.payload);
      this.logWorded(event);
    } else if (event instanceof ModeFinishedEvent) {
      // Terraform is named separately because it runs *outside* the mode: the plan is taken first
      // and handed to `octo.validate()`, so the mode measures only the correlating. Reporting the
      // bare number logged `Finished "validate" in 2ms.` after four minutes of planning.
      const terraformInMs = this.terraformInMs;
      this.terraformInMs = 0;

      this.reportRun(event.payload.durationInMs);
      this.logWorded(event, { terraformInMs });
    } else if (event instanceof ModeFailedEvent) {
      this.reportRun(event.payload.durationInMs, event.payload.error.message);
      this.logWorded(event);
    }
  }

  /**
   * What a mode concluded.
   */
  @OnEvent(ModeResultEvent)
  onModeResult(event: ModeResultEvent<unknown>): void {
    if (event instanceof ValidateModeCompletedEvent) {
      this.observer.validateCompleted(event.payload.report);
    } else if (event instanceof CommitModeCompletedEvent) {
      this.observer.commitCompleted(event.payload);
    }
    this.logWorded(event);
  }

  /**
   * A module was applied.
   */
  @OnEvent(ModuleEvent)
  onModule(event: ModuleEvent): void {
    this.logWorded(event);
  }

  /**
   * A decorated class registered itself at boot.
   */
  @OnEvent(RegistrationEvent)
  onRegistration(event: RegistrationEvent): void {
    if (event instanceof AnchorRegistrationEvent) {
      this.logger.log.withMetadata({ name: event.name }).trace('Anchor registered.');
    } else if (event instanceof ModelActionRegistrationEvent) {
      this.logger.log.withMetadata({ name: event.name }).trace('Model action registered.');
    } else if (event instanceof ModelRegistrationEvent) {
      this.logger.log.withMetadata({ name: event.name }).trace('Model registered.');
    } else if (event instanceof OverlayRegistrationEvent) {
      this.logger.log.withMetadata({ name: event.name }).trace('Overlay registered.');
    } else if (event instanceof ResourceActionRegistrationEvent) {
      this.logger.log.withMetadata({ name: event.name }).trace('Resource action registered.');
    } else if (event instanceof ResourceRegistrationEvent) {
      this.logger.log.withMetadata({ name: event.name }).trace('Resource registered.');
    }
  }

  /**
   * State was read or written.
   */
  @OnEvent(SerializationEvent)
  async onSerialization(event: SerializationEvent<unknown>): Promise<void> {
    if (event instanceof ModelDeserializedEvent) {
      this.logger.log.debug('Models de-serialized.');
    } else if (event instanceof ModelSerializedEvent) {
      this.logger.log.debug('Models serialized.');
    } else if (event instanceof ResourceDeserializedEvent) {
      this.logger.log.debug('Resources de-serialized.');
    } else if (event instanceof ActualResourceSerializedEvent) {
      this.logger.log.debug('Actual Resources serialized.');
    } else if (event instanceof NewResourceSerializedEvent) {
      this.logger.log.debug('New Resources serialized.');
    }
  }

  /**
   * Terragrunt folder writes, and terraform commands with their duration.
   */
  @OnEvent(TerraformEvent)
  onTerraform(event: TerraformEvent<unknown>): void {
    if (event instanceof TerraformFoldersWrittenEvent || event instanceof TerraformCommandStartedEvent) {
      this.logWorded(event);
    } else if (event instanceof TerraformCommandFinishedEvent) {
      this.terraformInMs += event.payload.durationInMs;
      this.observer.terraformCommandFinished(event.payload.durationInMs);
      this.logWorded(event);
    } else if (event instanceof TerraformProcessStartedEvent) {
      const { args, binary, processId } = event.payload;
      this.terraformProcesses.set(processId, {
        command: event.name ?? binary,
        isJson: args.includes('-json'),
        partialLines: { stderr: '', stdout: '' },
      });
      this.logWorded(event);
    } else if (event instanceof TerraformProcessOutputEvent) {
      const { processId, stream, text } = event.payload;
      const terraformProcess = this.terraformProcesses.get(processId);
      if (!terraformProcess || (terraformProcess.isJson && stream === 'stdout')) {
        return;
      }

      // Print each whole line, holding back the end of the chunk until the line it starts is whole.
      const lines = (terraformProcess.partialLines[stream] + text).split('\n');
      terraformProcess.partialLines[stream] = lines.pop()!;
      for (const line of lines) {
        this.logTerraformLine(processId, stream, line);
      }
    } else if (event instanceof TerraformProcessExitedEvent) {
      const { processId } = event.payload;
      const terraformProcess = this.terraformProcesses.get(processId);
      if (!terraformProcess) {
        return;
      }

      // Print what is left of each stream, which ended without a newline.
      for (const stream of ['stdout', 'stderr'] as const) {
        if (terraformProcess.partialLines[stream]) {
          this.logTerraformLine(processId, stream, terraformProcess.partialLines[stream]);
        }
      }
      this.terraformProcesses.delete(processId);
      this.logWorded(event, {}, terraformProcess.command);
    }
  }

  /**
   * The diffs, the transaction built from them, and each resource action as it runs.
   */
  @OnEvent(TransactionEvent)
  onTransaction(event: TransactionEvent<any>): void {
    if (event instanceof ModelTransactionTransactionEvent) {
      this.observer.modelTransaction(event.payload);
      this.logWorded(event);
    } else if (event instanceof ResourceActionInitiatedTransactionEvent) {
      // `info`, not `debug`: this is real infrastructure work running in this process.
      this.resourceActionStartedAt.set(this.resourceActionKey(event.name, event.payload as DiffMetadata), Date.now());
      this.logWorded(event);
    } else if (event instanceof ResourceActionCompletedTransactionEvent) {
      const key = this.resourceActionKey(event.name, event.payload as DiffMetadata);
      const startedAt = this.resourceActionStartedAt.get(key);
      this.resourceActionStartedAt.delete(key);

      this.logWorded(event, { durationInMs: startedAt === undefined ? undefined : Date.now() - startedAt });
    } else {
      this.logWorded(event);
    }
  }

  /**
   * One line a terraform process printed, tagged with the process and the stream.
   */
  private logTerraformLine(processId: number, stream: 'stderr' | 'stdout', line: string): void {
    const { command } = this.terraformProcesses.get(processId)!;
    this.logger.log.withMetadata({ command, processId, stream }).info(line);
  }

  /**
   * Logs an event as {@link EventWordingUtility} words it, from the payload its journal entry holds.
   * An event no journal records logs nothing.
   *
   * @param name The event's subject, where the event itself does not carry it.
   */
  private logWorded(event: Event<unknown>, context: WordingContext = {}, name: string = event.name ?? ''): void {
    const eventClass: unknown = event.constructor;
    const type = event.constructor.name as keyof EventPayloads;
    if (JournalUtility.EVENT_CLASSES[type] !== eventClass) {
      return;
    }

    const entry = { name, payload: JournalUtility.toPlain(event.payload), type } as Pick<
      JournalEntry,
      'name' | 'payload' | 'type'
    >;
    for (const { level, metadata, text } of EventWordingUtility.word(entry, context) ?? []) {
      this.logger.log.withMetadata(metadata)[level](text);
    }
  }

  /**
   * The whole report for the mode that just ended, as plain text.
   *
   * Rendered from {@link OctoReport}. It goes through the logger rather than straight to the terminal,
   * which is what makes it obey the configured level.
   *
   * `generate` and `run-action` produce no report, and nothing is printed for them.
   */
  private reportRun(durationInMs: number, error?: string): void {
    const report = this.observer.finish({ durationInMs, error });
    if (report) {
      this.logger.log.info(`\n${renderReportText(report)}\n`);
    }
  }

  /**
   * Identifies an in-flight resource action, so its duration can be reported on completion.
   */
  private resourceActionKey(actionName: string, diff: DiffMetadata): string {
    return [diff.node.getContext(), diff.field, diff.action, actionName].join(':');
  }
}

/**
 * @internal
 */
@Factory<LoggingEventListener>(LoggingEventListener)
export class LoggingEventListenerFactory {
  private static instance: LoggingEventListener;

  /**
   * Called at boot with the definition's options, and again on every event dispatch with none,
   * because `EventService` resolves listeners by class name.
   *
   * This listener owns the process logger's settings — options reconfigure the shared logger in
   * place, so the one instance held here sees them without being rebuilt.
   */
  static async create(options?: LoggerOptions): Promise<LoggingEventListener> {
    const logger = Logger.shared(options);
    this.instance ??= new LoggingEventListener(logger);
    return this.instance;
  }
}

export type { LoggerOptions };
