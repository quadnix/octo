import { HtmlUtility } from '../../utilities/html/html.utility.js';
import { TimestampUtility } from '../../utilities/timestamp/timestamp.utility.js';
import { CHANGE_SYMBOLS, type ChangeKind, type OctoReport } from '../report.model.js';
import { REPORT_STYLES } from './report.styles.js';

/**
 * One row of the index.
 *
 * Everything past `basename`/`mode`/`timestamp` is read from the run's JSON, so it is optional: a
 * report written by an older version, or one caught half-written, still gets a row and a link.
 */
export interface IndexRun {
  basename: string;
  driftCount?: number;
  headline?: string;
  mode: string;
  outcome?: OctoReport['outcome'];
  timestamp: string;
  totals?: Record<ChangeKind, number>;
}

const COUNTED: ChangeKind[] = ['delete', 'recreate', 'create', 'update'];

/**
 * The same mini-counters the report pages carry, so a row reads like the page it links to.
 */
function renderCounts(run: IndexRun): string {
  if (!run.totals) {
    return '';
  }

  const parts = COUNTED.filter((kind) => (run.totals![kind] ?? 0) > 0).map(
    (kind) => `<span class="${kind}">${CHANGE_SYMBOLS[kind]}${run.totals![kind]}</span>`,
  );

  if (run.driftCount) {
    parts.push(`<span class="delete">⚠${run.driftCount}</span>`);
  }

  return parts.length > 0 ? `<span class="mini">${parts.join('')}</span>` : '<span class="dim">—</span>';
}

/**
 * Lists every report in the directory, newest first.
 *
 * Rows carry the outcome, the counts and the headline, because the question the index exists to
 * answer is "which of these 27 runs was the drifted one" — and a column of dates cannot answer it.
 */
export function renderIndexHtml(runs: IndexRun[]): string {
  const rows = runs
    .map(
      (run) =>
        '<tr>' +
        `<td><code>${HtmlUtility.escapeHtml(TimestampUtility.readableTimestamp(run.timestamp))}</code></td>` +
        `<td>${HtmlUtility.escapeHtml(run.mode)}</td>` +
        `<td>${run.outcome ? `<span class="badge ${HtmlUtility.escapeHtml(run.outcome)}">${HtmlUtility.escapeHtml(run.outcome)}</span>` : ''}</td>` +
        `<td>${renderCounts(run)}</td>` +
        `<td class="index-headline">${HtmlUtility.escapeHtml(run.headline ?? '')}</td>` +
        `<td><a href="./${HtmlUtility.escapeHtml(run.basename)}">open</a></td>` +
        `<td><a href="./${HtmlUtility.escapeHtml(run.basename.replace(/\.html$/, '.json'))}">json</a></td>` +
        '</tr>',
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>octo reports</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
<div class="wrap">
  <div class="strip"><div class="strip-top"><span class="strip-app">Octo reports</span>
  <span class="strip-meta">${runs.length} run(s)</span></div></div>
  <div class="card scroll-x"><table>
    <thead><tr><th>Run</th><th>Mode</th><th>Outcome</th><th>Changes</th><th>Headline</th>
    <th>Report</th><th>Payload</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="empty">No reports yet.</td></tr>'}</tbody>
  </table></div>
</div>
</body>
</html>
`;
}
