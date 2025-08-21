import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DiffAction, type ResourceActionSummaryTransactionEvent } from '@quadnix/octo';
import { renderFile } from 'ejs';
import { diff } from 'jsondiffpatch';
import * as HtmlFormatter from 'jsondiffpatch/formatters/html';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * A resource-action-summary event received when a resource action is completed.
 */
export interface IResourceActionSummaryEvent {
  action: string;
  eventPayloads: Exclude<ResourceActionSummaryTransactionEvent['payload'], undefined>[];
}

/**
 * A row with detailed view of a resource-action-summary event.
 */
interface IResourceActionSummaryRow {
  action: string;
  changes: string;
  diffAction: DiffAction;
  diffField: string;
  resourceId: string;
}

/**
 * Stats for all the resource-action-summary events.
 */
interface IResourceActionSummaryStats {
  add: number;
  delete: number;
  replace: number;
  total: number;
  update: number;
}

/**
 * An interface for the entire resource-diff representing the transaction plan.
 */
export interface IResourceTransactionPlan {
  dirtyResources: IResourceTransactionPlanRow[];
  goodResources: IResourceTransactionPlanRow[];
}

/**
 * A row with detailed view of an individual resource-diff.
 */
interface IResourceTransactionPlanRow {
  action: string;
  diffAction: DiffAction;
  diffField: string;
  resourceId: string;
  responseData?: string;
  status: 'completed' | 'failed' | 'in-progress' | 'not-run';
}

/**
 * An input interface for the HTML reporter.
 */
interface IResourceTransactionSummaryReportData {
  resourceActionSummaryRows: Array<IResourceActionSummaryRow>;
  resourceActionSummaryStats: IResourceActionSummaryStats;
  resourceTransactionPlan: IResourceTransactionPlan;
  timestamp: string;
  title: string;
}

export class HtmlReporter {
  private static calculateResourceActionSummaryStats(rows: IResourceActionSummaryRow[]): IResourceActionSummaryStats {
    const stats = {
      add: 0,
      delete: 0,
      replace: 0,
      total: rows.length,
      update: 0,
    };

    rows.forEach((row) => {
      switch (row.diffAction) {
        case DiffAction.ADD:
          stats.add++;
          break;
        case DiffAction.DELETE:
          stats.delete++;
          break;
        case DiffAction.REPLACE:
          stats.replace++;
          break;
        default:
          stats.update++;
          break;
      }
    });

    return stats;
  }

  private static escapeHtml(text: string): string {
    return text
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  static async generateReport(
    resourceActionSummaryEvents: IResourceActionSummaryEvent[],
    resourceTransactionPlan: IResourceTransactionPlan,
    options: {
      outputPath: string;
      title: string;
    },
  ): Promise<void> {
    const { title, outputPath } = options;
    const rows: IResourceActionSummaryRow[] = [];

    for (const { action, eventPayloads } of resourceActionSummaryEvents) {
      for (const payload of eventPayloads) {
        const delta = diff(payload.values.previous, payload.values.current);
        const htmlDelta = HtmlFormatter.format(delta, payload.values.previous);
        rows.push({
          action: action,
          changes: htmlDelta!,
          diffAction: payload.diffAction,
          diffField: payload.diffField,
          resourceId: payload.resourceId,
        });
      }
    }

    // Prepare data for the template
    const templateData: IResourceTransactionSummaryReportData = {
      resourceActionSummaryRows: rows.map((row) => ({
        action: this.escapeHtml(row.action),
        changes: row.changes || 'No changes',
        diffAction: row.diffAction,
        diffField: this.escapeHtml(row.diffField),
        resourceId: this.escapeHtml(row.resourceId),
      })),
      resourceActionSummaryStats: this.calculateResourceActionSummaryStats(rows),
      resourceTransactionPlan,
      timestamp: new Date().toLocaleString(),
      title,
    };

    const templateFilePath = join(this.getTemplateDirectory(), 'resource-summary-layout.ejs');
    const html = await renderFile(templateFilePath, templateData);
    writeFileSync(outputPath, html, 'utf8');
  }

  private static getTemplateDirectory(): string {
    return join(__dirname, 'templates');
  }
}
