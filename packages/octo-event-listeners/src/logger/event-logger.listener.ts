import {
  ActionEvent,
  ActualResourceSerializedEvent,
  AnchorRegistrationEvent,
  Container,
  DiffAction,
  Factory,
  HookEvent,
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
  TransactionEvent,
} from '@quadnix/octo';
import { Table } from 'console-table-printer';
import { diffString } from 'json-diff';
import { OctoEventLogger } from './logger.factory.js';

export class EventLoggerListener {
  private readonly resourceSummaries = new Map<
    string,
    Exclude<ResourceActionSummaryTransactionEvent['payload'], undefined>[]
  >();

  constructor(private readonly logger: OctoEventLogger) {}

  @OnEvent(ActionEvent)
  onAction(event: ActionEvent): void {
    this.logger.log
      .withMetadata({ name: event.name, payload: event.payload?.metadata || {}, timestamp: event.header.timestamp })
      .debug(event.payload?.message || 'Action event.');
  }

  @OnEvent(HookEvent)
  onHook(event: HookEvent): void {
    if (event instanceof PostCommitHookCallbackDoneEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('PostCommit hook callback executed.');
    } else if (event instanceof PreCommitHookCallbackDoneEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('PreCommit hook callback executed.');
    } else if (event instanceof PostModelActionHookCallbackDoneEvent) {
      this.logger.log
        .withMetadata({ name: event.name, timestamp: event.header.timestamp })
        .debug('PostModelAction hook callback executed.');
    } else if (event instanceof PreModelActionHookCallbackDoneEvent) {
      this.logger.log
        .withMetadata({ name: event.name, timestamp: event.header.timestamp })
        .debug('PreModelAction hook callback executed.');
    } else if (event instanceof PostResourceActionHookCallbackDoneEvent) {
      this.logger.log
        .withMetadata({ name: event.name, timestamp: event.header.timestamp })
        .debug('PostResourceAction hook callback executed.');
    } else if (event instanceof PreResourceActionHookCallbackDoneEvent) {
      this.logger.log
        .withMetadata({ name: event.name, timestamp: event.header.timestamp })
        .debug('PreResourceAction hook callback executed.');
    }
  }

  @OnEvent(ModuleEvent)
  onModule(event: ModuleEvent): void {
    this.logger.log.withMetadata({ name: event.name, timestamp: event.header.timestamp }).debug('Module loaded.');
  }

  @OnEvent(RegistrationEvent)
  onRegistration(event: RegistrationEvent): void {
    if (event instanceof AnchorRegistrationEvent) {
      this.logger.log.withMetadata({ name: event.name, timestamp: event.header.timestamp }).debug('Anchor registered.');
    } else if (event instanceof ModelActionRegistrationEvent) {
      this.logger.log
        .withMetadata({ name: event.name, timestamp: event.header.timestamp })
        .debug('Model action registered.');
    } else if (event instanceof ModelRegistrationEvent) {
      this.logger.log.withMetadata({ name: event.name, timestamp: event.header.timestamp }).debug('Model registered.');
    } else if (event instanceof OverlayRegistrationEvent) {
      this.logger.log
        .withMetadata({ name: event.name, timestamp: event.header.timestamp })
        .debug('Overlay registered.');
    } else if (event instanceof ResourceActionRegistrationEvent) {
      this.logger.log
        .withMetadata({ name: event.name, timestamp: event.header.timestamp })
        .debug('Resource action registered.');
    } else if (event instanceof ResourceRegistrationEvent) {
      this.logger.log
        .withMetadata({ name: event.name, timestamp: event.header.timestamp })
        .debug('Resource registered.');
    }
  }

  @OnEvent(SerializationEvent)
  onSerialization(event: SerializationEvent<unknown>): void {
    if (event instanceof ModelDeserializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Models de-serialized.');
    } else if (event instanceof ModelSerializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Models serialized.');
    } else if (event instanceof ResourceDeserializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Resources de-serialized.');
    } else if (event instanceof ActualResourceSerializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Actual Resources serialized.');
    } else if (event instanceof NewResourceSerializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('New Resources serialized.');
    }
  }

  @OnEvent(TransactionEvent)
  onTransaction(event: TransactionEvent<any>): void {
    if (event instanceof ModelActionTransactionEvent) {
      this.logger.log
        .withMetadata({ name: event.name, timestamp: event.header.timestamp })
        .debug('Model action executed.');
    } else if (event instanceof ModelDiffsTransactionEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Model diffs executed.');
    } else if (event instanceof ModelTransactionTransactionEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Model transactions executed.');
    } else if (event instanceof ResourceActionCompletedTransactionEvent) {
      this.logger.log
        .withMetadata({ name: event.name, payload: event.payload, timestamp: event.header.timestamp })
        .debug('Resource action executed.');
    } else if (event instanceof ResourceActionInitiatedTransactionEvent) {
      this.logger.log
        .withMetadata({ name: event.name, payload: event.payload, timestamp: event.header.timestamp })
        .debug('Resource action execution initiated.');
    } else if (event instanceof ResourceActionSummaryTransactionEvent) {
      if (this.resourceSummaries.has(event.name!)) {
        this.resourceSummaries.get(event.name!)!.push(event.payload!);
      } else {
        this.resourceSummaries.set(event.name!, [event.payload!]);
      }
    } else if (event instanceof ResourceDiffsTransactionEvent) {
      this.logger.log
        .withMetadata({ payload: event.payload, timestamp: event.header.timestamp })
        .debug('Resource diffs executed.');
    } else if (event instanceof ResourceTransactionTransactionEvent) {
      this.logger.log
        .withMetadata({ payload: event.payload, timestamp: event.header.timestamp })
        .debug('Resource transactions executed.');

      this.printResourceSummary();
    }
  }

  private printColor(diffAction: DiffAction): 'blue' | 'green' | 'red' | 'yellow' {
    switch (diffAction) {
      case DiffAction.ADD:
        return 'green';
      case DiffAction.DELETE:
        return 'red';
      case DiffAction.REPLACE:
        return 'yellow';
      default:
        return 'blue';
    }
  }

  private printResourceSummary(): void {
    const summary = new Table({
      columns: [
        { name: 'Action' },
        { name: 'ResourceId' },
        { name: 'DiffAction' },
        { name: 'DiffField' },
        { alignment: 'left', maxLen: 100, name: 'Changes' },
      ],
      title: 'Resource Summary',
    });

    for (const [resourceActionClass, resourceSummaries] of this.resourceSummaries.entries()) {
      for (const resourceSummary of resourceSummaries) {
        summary.addRow(
          {
            Action: resourceActionClass,
            Changes: diffString(resourceSummary.values.previous, resourceSummary.values.current),
            DiffAction: resourceSummary.diffAction,
            DiffField: resourceSummary.diffField,
            ResourceId: resourceSummary.resourceId,
          },
          { color: this.printColor(resourceSummary.diffAction) },
        );
      }
    }

    summary.printTable();
    this.resourceSummaries.clear();
  }
}

@Factory<EventLoggerListener>(EventLoggerListener)
export class EventLoggerListenerFactory {
  private static instance: EventLoggerListener;

  static async create(): Promise<EventLoggerListener> {
    if (!this.instance) {
      const logger = await Container.getInstance().get(OctoEventLogger);
      this.instance = new EventLoggerListener(logger);
    }
    return this.instance;
  }
}
