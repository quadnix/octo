import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DiffAction, type ResourceActionSummaryTransactionEvent } from '@quadnix/octo';
import { renderFile } from 'ejs';
import { diff } from 'jsondiffpatch';
import * as HtmlFormatter from 'jsondiffpatch/formatters/html';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface IResourceActionSummaryEvent {
  actionClassName: string;
  eventPayloads: Exclude<ResourceActionSummaryTransactionEvent['payload'], undefined>[];
}

interface IResourceSummaryRow {
  action: string;
  changes: string;
  diffAction: DiffAction;
  diffField: string;
  resourceId: string;
}

interface IResourceSummaryStats {
  add: number;
  delete: number;
  replace: number;
  total: number;
  update: number;
}

interface IResourceSummaryData {
  rows: Array<IResourceSummaryRow>;
  summaryStats: IResourceSummaryStats;
  timestamp: string;
  title: string;
}

export class HtmlReporter {
  private static calculateStats(rows: IResourceSummaryRow[]): IResourceSummaryStats {
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

  private static getTemplateDirectory(): string {
    return join(__dirname, 'templates');
  }

  static async generateReport(
    resourceSummaries: IResourceActionSummaryEvent[],
    options: {
      outputPath: string;
      title: string;
    },
  ): Promise<void> {
    const { title, outputPath } = options;
    const rows: IResourceSummaryRow[] = [];

    for (const { actionClassName, eventPayloads } of resourceSummaries) {
      for (const payload of eventPayloads) {
        const delta = diff(payload.values.previous, payload.values.current);
        const htmlDelta = HtmlFormatter.format(delta, payload.values.previous);
        rows.push({
          action: actionClassName,
          changes: htmlDelta!,
          diffAction: payload.diffAction,
          diffField: payload.diffField,
          resourceId: payload.resourceId,
        });
      }
    }

    // Prepare data for the template
    const templateData: IResourceSummaryData = {
      rows: rows.map((row) => ({
        action: this.escapeHtml(row.action),
        changes: row.changes || 'No changes',
        diffAction: row.diffAction,
        diffField: this.escapeHtml(row.diffField),
        resourceId: this.escapeHtml(row.resourceId),
      })),
      summaryStats: this.calculateStats(rows),
      timestamp: new Date().toLocaleString(),
      title,
    };

    const templateFilePath = join(this.getTemplateDirectory(), 'resource-summary-layout.ejs');
    const html = await renderFile(templateFilePath, templateData);
    writeFileSync(outputPath, html, 'utf8');
  }
}
