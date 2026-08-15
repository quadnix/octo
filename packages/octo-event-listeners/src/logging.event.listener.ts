import {
  ActionEvent,
  ActualResourceSerializedEvent,
  AnchorRegistrationEvent,
  CommitModeCompletedEvent,
  type DiffMetadata,
  Factory,
  HookEvent,
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
  SerializationEvent,
  TerraformCommandFinishedEvent,
  TerraformCommandStartedEvent,
  TerraformEvent,
  TerraformFoldersWrittenEvent,
  TransactionEvent,
  ValidateModeCompletedEvent,
} from '@quadnix/octo';
import { type LogDestination, Logger, type LoggerOptions } from './logger/logger.factory.js';

/**
 * Logs octo's event stream. Levels:
 *
 * - `error` - a mode failed.
 * - `warn`  - drift, commit warnings, a non-zero terraform exit.
 * - `info`  - mode boundaries, folders written, terraform commands, mode results, report paths,
 *             SDK resource actions.
 * - `debug` - diffs, transactions, serialization, hooks, author `log()` calls.
 * - `trace` - class registration.
 */
export class LoggingEventListener {
  /**
   * Start times of in-flight resource actions, used to report their duration on completion.
   */
  private readonly resourceActionStartedAt: Map<string, number> = new Map();

  constructor(private readonly logger: Logger) {}

  @OnEvent(ActionEvent)
  onAction(event: ActionEvent): void {
    this.logger.log
      .withMetadata({ name: event.name, payload: event.payload?.metadata || {} })
      .debug(event.payload?.message || 'Action event.');
  }

  @OnEvent(HookEvent)
  onHook(event: HookEvent): void {
    if (event instanceof PostCommitHookCallbackDoneEvent) {
      this.logger.log.debug('PostCommit hook callback executed.');
    } else if (event instanceof PreCommitHookCallbackDoneEvent) {
      this.logger.log.debug('PreCommit hook callback executed.');
    } else if (event instanceof PostModelActionHookCallbackDoneEvent) {
      this.logger.log.withMetadata({ name: event.name }).debug('PostModelAction hook callback executed.');
    } else if (event instanceof PreModelActionHookCallbackDoneEvent) {
      this.logger.log.withMetadata({ name: event.name }).debug('PreModelAction hook callback executed.');
    } else if (event instanceof PostResourceActionHookCallbackDoneEvent) {
      this.logger.log.withMetadata({ name: event.name }).debug('PostResourceAction hook callback executed.');
    } else if (event instanceof PreResourceActionHookCallbackDoneEvent) {
      this.logger.log.withMetadata({ name: event.name }).debug('PreResourceAction hook callback executed.');
    }
  }

  /**
   * Mode boundaries, and the only path by which a mode failure reaches a listener.
   */
  @OnEvent(ModeEvent)
  onMode(event: ModeEvent): void {
    const { appName, mode } = event.payload;

    if (event instanceof ModeStartedEvent) {
      this.logger.log.withMetadata({ appName, mode }).info(`Started "${mode}"${appName ? ` on "${appName}"` : ''}.`);
    } else if (event instanceof ModeFinishedEvent) {
      this.logger.log
        .withMetadata({ appName, durationInMs: event.payload.durationInMs, mode })
        .info(`Finished "${mode}" in ${event.payload.durationInMs}ms.`);
    } else if (event instanceof ModeFailedEvent) {
      this.logger.log
        .withMetadata({ appName, durationInMs: event.payload.durationInMs, mode })
        .error(`Failed "${mode}" after ${event.payload.durationInMs}ms: ${event.payload.error}`);
    }
  }

  /**
   * What a mode concluded.
   */
  @OnEvent(ModeResultEvent)
  onModeResult(event: ModeResultEvent<unknown>): void {
    if (event instanceof ValidateModeCompletedEvent) {
      const { report } = event.payload;
      const terraformChangeCount = report.intentChanges.reduce(
        (total, change) => total + change.terraformChanges.length,
        report.attributedChanges.length,
      );

      this.logger.log
        .withMetadata({
          confidence: report.confidence,
          driftCount: report.drift.length,
          failureCount: report.failures.length,
          resourceChangeCount: report.intentChanges.length,
          terraformChangeCount,
          uncertainCount: report.uncertain.length,
        })
        .info(
          `Validate: ${report.intentChanges.length} resource change(s), ` +
            `${terraformChangeCount} terraform change(s), ${report.drift.length} drift ` +
            `(${report.confidence}).`,
        );

      if (report.drift.length > 0) {
        this.logger.log
          .withMetadata({ addresses: report.drift.map((entry) => entry.address) })
          .warn(`${report.drift.length} terraform change(s) are drift — nothing in intent explains them.`);
      }
      for (const failure of report.failures) {
        this.logger.log.withMetadata({ moduleId: failure.moduleId }).error(failure.message);
      }
      for (const note of report.notes) {
        this.logger.log.withMetadata({ moduleId: note.moduleId }).debug(note.message);
      }
    } else if (event instanceof CommitModeCompletedEvent) {
      const { emptiedModuleIds, responses, warnings } = event.payload;
      const moved = responses.filter((response) => response.previousValue !== response.value);

      this.logger.log
        .withMetadata({ emptiedModuleIds, movedCount: moved.length, responseCount: responses.length })
        .info(`Commit: recorded ${responses.length} response value(s), ${moved.length} changed.`);

      for (const warning of warnings) {
        this.logger.log.withMetadata({ moduleId: warning.moduleId }).warn(warning.message);
      }
    }
  }

  @OnEvent(ModuleEvent)
  onModule(event: ModuleEvent): void {
    this.logger.log.withMetadata({ name: event.name }).debug('Module loaded.');
  }

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
    if (event instanceof TerraformFoldersWrittenEvent) {
      const { emptied, outputDir, written } = event.payload;
      this.logger.log
        .withMetadata({ emptied, outputDir, written })
        .info(
          `Wrote ${written.length} terragrunt folder(s) to "${outputDir}"` +
            (emptied.length > 0 ? `, emptied ${emptied.length} (deleted from intent).` : '.'),
        );
    } else if (event instanceof TerraformCommandStartedEvent) {
      this.logger.log
        .withMetadata({ command: event.payload.command, dir: event.payload.dir })
        .info(`Running terraform "${event.payload.command}".`);
    } else if (event instanceof TerraformCommandFinishedEvent) {
      const { command, durationInMs, exitCode } = event.payload;
      const metadata = { command, dir: event.payload.dir, durationInMs, exitCode };
      if (exitCode === 0) {
        this.logger.log.withMetadata(metadata).info(`Terraform "${command}" finished in ${durationInMs}ms.`);
      } else {
        this.logger.log.withMetadata(metadata).warn(`Terraform "${command}" exited ${exitCode}.`);
      }
    }
  }

  @OnEvent(TransactionEvent)
  onTransaction(event: TransactionEvent<any>): void {
    if (event instanceof ModelActionTransactionEvent) {
      this.logger.log.withMetadata({ name: event.name }).debug('Model action executed.');
    } else if (event instanceof ModelDiffsTransactionEvent) {
      this.logger.log.debug('Model diffs executed.');
    } else if (event instanceof ModelTransactionTransactionEvent) {
      this.logger.log.debug('Model transactions executed.');
    } else if (event instanceof ResourceActionInitiatedTransactionEvent) {
      // `info`, not `debug`: this is real infrastructure work running in this process.
      const diff = event.payload as DiffMetadata;
      this.resourceActionStartedAt.set(this.resourceActionKey(event.name, diff), Date.now());
      this.logger.log
        .withMetadata({ action: event.name, resource: diff.node.getContext() })
        .info(`Resource action "${event.name}" started on "${diff.node.getContext()}".`);
    } else if (event instanceof ResourceActionCompletedTransactionEvent) {
      const diff = event.payload as DiffMetadata;
      const key = this.resourceActionKey(event.name, diff);
      const startedAt = this.resourceActionStartedAt.get(key);
      this.resourceActionStartedAt.delete(key);

      const durationInMs = startedAt === undefined ? undefined : Date.now() - startedAt;
      this.logger.log
        .withMetadata({ action: event.name, durationInMs, resource: diff.node.getContext() })
        .info(
          `Resource action "${event.name}" completed on "${diff.node.getContext()}"` +
            (durationInMs === undefined ? '.' : ` in ${durationInMs}ms.`),
        );
    } else if (event instanceof ResourceActionSummaryTransactionEvent) {
      this.logger.log
        .withMetadata({
          action: event.name,
          resource: (event.payload.diff as DiffMetadata).node.getContext(),
          values: event.payload.values,
        })
        .debug('Resource action summary.');
    } else if (event instanceof ResourceDiffsTransactionEvent) {
      this.logger.log.debug('Resource diffs executed.');
    } else if (event instanceof ResourceTransactionTransactionEvent) {
      this.logger.log.debug('Resource transactions executed.');
    }
  }

  private resourceActionKey(actionName: string, diff: DiffMetadata): string {
    return [diff.node.getContext(), diff.field, diff.action, actionName].join(':');
  }
}

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

export type { LogDestination, LoggerOptions };
