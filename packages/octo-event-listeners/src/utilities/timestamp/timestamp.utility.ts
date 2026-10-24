/**
 * Formats the times a report prints, in the machine's own time zone.
 *
 * @internal
 */
export class TimestampUtility {
  /**
   * `1755226471000` -> `2025-08-15 08:24:31 GMT+5:30` on a machine in India.
   */
  static formatTimestamp(epochMs: number): string {
    // eslint-disable-next-line no-restricted-properties
    const format = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
      year: 'numeric',
    });
    const parts = Object.fromEntries(format.formatToParts(epochMs).map((part) => [part.type, part.value]));

    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}`;
  }
}
