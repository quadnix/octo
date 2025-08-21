import {
  AResource,
  ActionEvent,
  ActualResourceSerializedEvent,
  AnchorRegistrationEvent,
  Container,
  type DiffMetadata,
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
import {
  HtmlReporter,
  type IResourceActionSummaryEvent,
  type IResourceTransactionPlan,
} from '../reporters/html/html.reporter.js';
import { OctoEventLogger } from './logger.factory.js';

export class EventLoggerListener {
  private readonly resourceActionSummaryEvents: IResourceActionSummaryEvent[] = [];
  private readonly resourceTransactionPlan: IResourceTransactionPlan = { dirtyResources: [], goodResources: [] };
  private readonly resourceStatuses: Map<string, IResourceTransactionPlan['goodResources'][0]> = new Map();

  constructor(private readonly logger: OctoEventLogger) {}

  private createUniqueTransactionResourceActionKey(diff: DiffMetadata): string {
    return [diff.node.getContext(), diff.field, diff.action].join(':');
  }

  private async generateResourceTransactionSummaryReport(): Promise<void> {
    try {
      const outputPath = `resource-transaction-summary-${Date.now()}.html`;
      await HtmlReporter.generateReport(this.resourceActionSummaryEvents, this.resourceTransactionPlan, {
        outputPath,
        title: 'Resource Transaction Summary',
      });
      this.logger.log.info(`Resource Transaction Summary HTML report generated: ${outputPath}`);
    } catch (error) {
      this.logger.log.error('Failed to generate Resource Transaction Summary HTML report:', error);
    }

    // Clear data for next transaction.
    this.resourceActionSummaryEvents.splice(0, this.resourceActionSummaryEvents.length);
    this.resourceTransactionPlan.dirtyResources.splice(0, this.resourceTransactionPlan.dirtyResources.length);
    this.resourceTransactionPlan.goodResources.splice(0, this.resourceTransactionPlan.goodResources.length);
    this.resourceStatuses.clear();
  }

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
  async onSerialization(event: SerializationEvent<unknown>): Promise<void> {
    if (event instanceof ModelDeserializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Models de-serialized.');
    } else if (event instanceof ModelSerializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Models serialized.');
    } else if (event instanceof ResourceDeserializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Resources de-serialized.');
    } else if (event instanceof ActualResourceSerializedEvent) {
      this.logger.log.withMetadata({ timestamp: event.header.timestamp }).debug('Actual Resources serialized.');

      // Mark all in-progress resource statuses as failed.
      for (const resource of this.resourceStatuses.values()) {
        if (resource.status === 'in-progress') {
          resource.status = 'failed';
        }
      }
      // Generate resource transaction summary report.
      await this.generateResourceTransactionSummaryReport();
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

      // Update resource status to completed.
      const resourceKey = this.createUniqueTransactionResourceActionKey(event.payload);
      const resource = this.resourceStatuses.get(resourceKey);
      if (resource) {
        resource.status = 'completed';
        if ((event.payload.node as AResource<any, any>).response) {
          resource.responseData = JSON.stringify((event.payload.node as AResource<any, any>).response, null, 2);
        }
      }
    } else if (event instanceof ResourceActionInitiatedTransactionEvent) {
      this.logger.log
        .withMetadata({ name: event.name, payload: event.payload, timestamp: event.header.timestamp })
        .debug('Resource action execution initiated.');

      // Update resource status to in-progress.
      const resourceKey = this.createUniqueTransactionResourceActionKey(event.payload);
      const resource = this.resourceStatuses.get(resourceKey);
      if (resource) {
        resource.status = 'in-progress';
      }
    } else if (event instanceof ResourceActionSummaryTransactionEvent) {
      this.resourceActionSummaryEvents.push({ action: event.name, eventPayloads: [event.payload] });
    } else if (event instanceof ResourceDiffsTransactionEvent) {
      this.logger.log
        .withMetadata({ payload: event.payload, timestamp: event.header.timestamp })
        .debug('Resource diffs executed.');

      // Initialize transaction plan with good resources.
      for (const diff of event.payload[0].flat().sort((a, b) => a.applyOrder - b.applyOrder)) {
        const resourceTransactionPlanRow: IResourceTransactionPlan['goodResources'][0] = {
          action: event.name,
          diffAction: diff.action,
          diffField: diff.field,
          resourceId: (diff.node as AResource<any, any>).resourceId,
          status: 'not-run',
        };
        this.resourceTransactionPlan.goodResources.push(resourceTransactionPlanRow);
        this.resourceStatuses.set(this.createUniqueTransactionResourceActionKey(diff), resourceTransactionPlanRow);
      }
      // Initialize transaction plan with dirty resources.
      for (const diff of event.payload[1].flat().sort((a, b) => a.applyOrder - b.applyOrder)) {
        const resourceTransactionPlanRow: IResourceTransactionPlan['dirtyResources'][0] = {
          action: event.name,
          diffAction: diff.action,
          diffField: diff.field,
          resourceId: (diff.node as AResource<any, any>).resourceId,
          status: 'not-run',
        };
        this.resourceTransactionPlan.dirtyResources.push(resourceTransactionPlanRow);
        this.resourceStatuses.set(this.createUniqueTransactionResourceActionKey(diff), resourceTransactionPlanRow);
      }
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
