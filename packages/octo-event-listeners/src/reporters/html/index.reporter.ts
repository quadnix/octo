import { REPORT_STYLES } from './report.styles.js';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * `20260814T105124` back to `2026-08-14 10:51:24`.
 */
function readableTimestamp(timestamp: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(timestamp);
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}` : timestamp;
}

/**
 * Lists every report in the directory, newest first.
 */
export function renderIndexHtml(runs: { basename: string; mode: string; timestamp: string }[]): string {
  const rows = runs
    .map(
      (run) =>
        '<tr>' +
        `<td><code>${escapeHtml(readableTimestamp(run.timestamp))}</code></td>` +
        `<td>${escapeHtml(run.mode)}</td>` +
        `<td><a href="./${escapeHtml(run.basename)}">open</a></td>` +
        `<td><a href="./${escapeHtml(run.basename.replace(/\.html$/, '.json'))}">json</a></td>` +
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
    <thead><tr><th>Run</th><th>Mode</th><th>Report</th><th>Payload</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="empty">No reports yet.</td></tr>'}</tbody>
  </table></div>
</div>
</body>
</html>
`;
}
