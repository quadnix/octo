/**
 * One clock for the whole report directory.
 *
 * Report file names are UTC (`20260815T023431`), and the index reads them straight out of the name.
 * Every timestamp a report page renders is UTC too, so one run reads as one date and one time
 * wherever it is shown.
 */
export function formatTimestamp(epochMs: number): string {
  return `${new Date(epochMs)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '')} UTC`;
}

/**
 * `20260814T105124` -> `2026-08-14 10:51:24 UTC`.
 */
export function readableTimestamp(timestamp: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(timestamp);
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]} UTC` : timestamp;
}

/**
 * `20260814T105124`. Sortable, so file names order chronologically.
 */
export function timestampFor(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '');
}
