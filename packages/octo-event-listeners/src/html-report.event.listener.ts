import {
  AResource,
  ActualResourceSerializedEvent,
  type DiffMetadata,
  Factory,
  OnEvent,
  ResourceActionCompletedTransactionEvent,
  ResourceActionInitiatedTransactionEvent,
  ResourceActionSummaryTransactionEvent,
  ResourceDiffsTransactionEvent,
  SerializationEvent,
  TransactionEvent,
} from '@quadnix/octo';
import { Logger } from './logger/logger.factory.js';
import {
  HtmlReporter,
  type IResourceActionSummaryEvent,
  type IResourceTransactionPlan,
} from './reporters/html/html.reporter.js';

export class HtmlReportEventListener {
  private readonly resourceActionSummaryEvents: IResourceActionSummaryEvent[] = [];
  private readonly resourceTransactionPlan: IResourceTransactionPlan = { dirtyResources: [], goodResources: [] };
  private readonly resourceStatuses: Map<string, IResourceTransactionPlan['goodResources'][0]> = new Map();

  constructor(private readonly logger: Logger) {}

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
      this.logger.log
        .withMetadata({ payload: { outputPath }, timestamp: Date.now() })
        .info(`Resource Transaction Summary HTML report generated.`);
    } catch (error) {
      this.logger.log
        .withMetadata({ payload: { error }, timestamp: Date.now() })
        .error(`Failed to generate Resource Transaction Summary HTML report.`);
    }

    // Clear data for next transaction.
    this.resourceActionSummaryEvents.splice(0, this.resourceActionSummaryEvents.length);
    this.resourceTransactionPlan.dirtyResources.splice(0, this.resourceTransactionPlan.dirtyResources.length);
    this.resourceTransactionPlan.goodResources.splice(0, this.resourceTransactionPlan.goodResources.length);
    this.resourceStatuses.clear();
  }

  @OnEvent(SerializationEvent)
  async onSerialization(event: SerializationEvent<unknown>): Promise<void> {
    if (event instanceof ActualResourceSerializedEvent) {
      // Mark all in-progress resource statuses as failed.
      for (const resource of this.resourceStatuses.values()) {
        if (resource.status === 'in-progress') {
          resource.status = 'failed';
        }
      }
      // Generate resource transaction summary report.
      await this.generateResourceTransactionSummaryReport();
    }
  }

  @OnEvent(TransactionEvent)
  onTransaction(event: TransactionEvent<any>): void {
    if (event instanceof ResourceActionCompletedTransactionEvent) {
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
      // Update resource status to in-progress.
      const resourceKey = this.createUniqueTransactionResourceActionKey(event.payload);
      const resource = this.resourceStatuses.get(resourceKey);
      if (resource) {
        resource.status = 'in-progress';
      }
    } else if (event instanceof ResourceActionSummaryTransactionEvent) {
      this.resourceActionSummaryEvents.push({ action: event.name, eventPayloads: [event.payload] });
    } else if (event instanceof ResourceDiffsTransactionEvent) {
      // Initialize transaction plan with good resources.
      for (const diff of event.payload[0].flat().sort((a, b) => a.applyOrder - b.applyOrder)) {
        const resourceTransactionPlanRow: IResourceTransactionPlan['goodResources'][0] = {
          action: event.name,
          diffAction: diff.action,
          diffField: diff.field,
          resourceContext: diff.node.getContext(),
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
          resourceContext: diff.node.getContext(),
          status: 'not-run',
        };
        this.resourceTransactionPlan.dirtyResources.push(resourceTransactionPlanRow);
        this.resourceStatuses.set(this.createUniqueTransactionResourceActionKey(diff), resourceTransactionPlanRow);
      }
    }
  }
}

@Factory<HtmlReportEventListener>(HtmlReportEventListener)
export class HtmlReportEventListenerFactory {
  private static instance: HtmlReportEventListener;

  static async create(): Promise<HtmlReportEventListener> {
    if (!this.instance) {
      this.instance = new HtmlReportEventListener(new Logger());
    }
    return this.instance;
  }
}
