/**
 * One clock for the whole report directory.
 *
 * Report file names are UTC (`20260815T023431`), and the index reads them straight out of the name.
 * The report page used to render `toLocaleString()` instead, which filed the same run under two
 * different dates — `2026-08-15 02:34` in the index, `8/14/2026, 10:34 PM` on the page it links to.
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
