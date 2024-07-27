import {
  AnchorRegistrationEvent,
  CommitHookCallbackDoneEvent,
  Container,
  ErrorEvent,
  Factory,
  HookEvent,
  ModelActionHookCallbackDoneEvent,
  ModelActionRegistrationEvent,
  ModelActionTransactionEvent,
  ModelDeserializedEvent,
  ModelRegistrationEvent,
  ModelSerializedEvent,
  ModuleEvent,
  OnEvent,
  OverlayRegistrationEvent,
  PostCommitHookCallbackDoneEvent,
  PostModelActionHookCallbackDoneEvent,
  PostResourceActionHookCallbackDoneEvent,
  PreCommitHookCallbackDoneEvent,
  PreModelActionHookCallbackDoneEvent,
  PreResourceActionHookCallbackDoneEvent,
  RegistrationEvent,
  ResourceActionHookCallbackDoneEvent,
  ResourceActionRegistrationEvent,
  ResourceActionTransactionEvent,
  ResourceDeserializedEvent,
  ResourceRegistrationEvent,
  ResourceSerializedEvent,
  SerializationEvent,
  TransactionEvent,
} from '@quadnix/octo';
import { OctoEventLogger } from './logger.factory.js';

export class EventLoggerListener {
  constructor(private readonly logger: OctoEventLogger) {}

  @OnEvent(ErrorEvent)
  onError(event: ErrorEvent): void {
    this.logger.log
      .withMetadata({ error: event.payload, timestamp: event.header.timestamp })
      .error(event.payload.message);
  }

  @OnEvent(HookEvent)
  onHook(event: HookEvent): void {
    if (event instanceof CommitHookCallbackDoneEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Commit hook callback executed.');
    } else if (event instanceof PostCommitHookCallbackDoneEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('PostCommit hook callback executed.');
    } else if (event instanceof PreCommitHookCallbackDoneEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('PreCommit hook callback executed.');
    } else if (event instanceof ModelActionHookCallbackDoneEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('ModelAction hook callback executed.');
    } else if (event instanceof PostModelActionHookCallbackDoneEvent) {
      this.logger.log
        .withMetadata({ timestamp: event.header.timestamp })
        .debug('PostModelAction hook callback executed.');
    } else if (event instanceof PreModelActionHookCallbackDoneEvent) {
      this.logger.log
        .withMetadata({ timestamp: event.header.timestamp })
        .debug('PreModelAction hook callback executed.');
    } else if (event instanceof ResourceActionHookCallbackDoneEvent) {
      this.logger.log
        .withMetadata({ timestamp: event.header.timestamp })
        .debug('ResourceAction hook callback executed.');
    } else if (event instanceof PostResourceActionHookCallbackDoneEvent) {
      this.logger.log
        .withMetadata({ timestamp: event.header.timestamp })
        .debug('PostResourceAction hook callback executed.');
    } else if (event instanceof PreResourceActionHookCallbackDoneEvent) {
      this.logger.log
        .withMetadata({ timestamp: event.header.timestamp })
        .debug('PreResourceAction hook callback executed.');
    }
  }

  @OnEvent(ModuleEvent)
  onModule(event: ModuleEvent): void {
    this.logger.log.withMetadata({ name: event.payload, timestamp: event.header.timestamp }).debug('Module loaded.');
  }

  @OnEvent(RegistrationEvent)
  onRegistration(event: RegistrationEvent): void {
    if (event instanceof AnchorRegistrationEvent) {
      this.logger.log
        .withMetadata({ name: event.payload, timestamp: event.header.timestamp })
        .debug('Anchor registered.');
    } else if (event instanceof ModelActionRegistrationEvent) {
      this.logger.log
        .withMetadata({ name: event.payload, timestamp: event.header.timestamp })
        .debug('Model action registered.');
    } else if (event instanceof ModelRegistrationEvent) {
      this.logger.log
        .withMetadata({ name: event.payload, timestamp: event.header.timestamp })
        .debug('Model registered.');
    } else if (event instanceof OverlayRegistrationEvent) {
      this.logger.log
        .withMetadata({ name: event.payload, timestamp: event.header.timestamp })
        .debug('Overlay registered.');
    } else if (event instanceof ResourceActionRegistrationEvent) {
      this.logger.log
        .withMetadata({ name: event.payload, timestamp: event.header.timestamp })
        .debug('Resource action registered.');
    } else if (event instanceof ResourceRegistrationEvent) {
      this.logger.log
        .withMetadata({ name: event.payload, timestamp: event.header.timestamp })
        .debug('Resource registered.');
    }
  }

  @OnEvent(SerializationEvent)
  onSerialization(event: SerializationEvent): void {
    if (event instanceof ModelDeserializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Models de-serialized.');
    } else if (event instanceof ModelSerializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Models serialized.');
    } else if (event instanceof ResourceDeserializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Resources de-serialized.');
    } else if (event instanceof ResourceSerializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Resources serialized.');
    }
  }

  @OnEvent(TransactionEvent)
  onTransaction(event: TransactionEvent): void {
    if (event instanceof ModelActionTransactionEvent) {
      this.logger.log
        .withMetadata({ name: event.payload, timestamp: event.header.timestamp })
        .debug('Model action executed.');
    } else if (event instanceof ResourceActionTransactionEvent) {
      this.logger.log
        .withMetadata({ name: event.payload, timestamp: event.header.timestamp })
        .debug('Resource action executed.');
    }
  }
}

@Factory<EventLoggerListener>(EventLoggerListener)
export class EventLoggerListenerFactory {
  private static instance: EventLoggerListener;

  static async create(): Promise<EventLoggerListener> {
    if (!this.instance) {
      const logger = await Container.get(OctoEventLogger);
      this.instance = new EventLoggerListener(logger);
    }
    return this.instance;
  }
}
