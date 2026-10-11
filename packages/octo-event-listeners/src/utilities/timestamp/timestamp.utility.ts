/**
 * Formats the times a report prints, always in UTC.
 *
 * @internal
 */
export class TimestampUtility {
  /**
   * `1755226471000` -> `2025-08-15 02:54:31 UTC`.
   */
  static formatTimestamp(epochMs: number): string {
    return `${new Date(epochMs)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '')} UTC`;
  }
}
