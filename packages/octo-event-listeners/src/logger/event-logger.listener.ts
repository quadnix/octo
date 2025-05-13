import {
  ActualResourceSerializedEvent,
  AnchorRegistrationEvent,
  Container,
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
  ResourceActionRegistrationEvent,
  ResourceActionTransactionEvent,
  ResourceActionTransactionInitiatedEvent,
  ResourceDeserializedEvent,
  ResourceDiffsTransactionEvent,
  ResourceRegistrationEvent,
  ResourceTransactionTransactionEvent,
  SerializationEvent,
  TransactionEvent,
} from '@quadnix/octo';
import { OctoEventLogger } from './logger.factory.js';

export class EventLoggerListener {
  constructor(private readonly logger: OctoEventLogger) {}

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
    } else if (event instanceof ResourceActionTransactionEvent) {
      this.logger.log
        .withMetadata({ name: event.name, timestamp: event.header.timestamp })
        .debug('Resource action executed.');
    } else if (event instanceof ResourceActionTransactionInitiatedEvent) {
      this.logger.log
        .withMetadata({ name: event.name, timestamp: event.header.timestamp })
        .debug('Resource action execution initiated.');
    } else if (event instanceof ResourceDiffsTransactionEvent) {
      this.logger.log
        .withMetadata({ payload: event.payload, timestamp: event.header.timestamp })
        .debug('Resource diffs executed.');
    } else if (event instanceof ResourceTransactionTransactionEvent) {
      this.logger.log
        .withMetadata({ payload: event.payload, timestamp: event.header.timestamp })
        .debug('Resource transactions executed.');
    }
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
