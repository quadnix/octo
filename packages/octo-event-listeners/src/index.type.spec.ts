import type {
  EventPayloads,
  JournalEntry,
  JournalFile,
  JournalHeader,
  RecordedError,
  TerraformLogFile,
  TerraformLogRecord,
} from './index.type.js';

/**
 * True when `T` is data a file can hold: no function anywhere in it, so no class instance either.
 */
type IsPlain<T> = T extends (...args: never[]) => unknown
  ? false
  : T extends readonly (infer E)[]
    ? IsPlain<E>
    : T extends object
      ? { [K in keyof T]-?: IsPlain<T[K]> }[keyof T] extends true
        ? true
        : false
      : true;

/**
 * Each event whose payload, as the journal holds it, is not plain data.
 */
type NotPlainEvent = {
  [K in keyof EventPayloads]: IsPlain<EventPayloads[K]> extends true ? never : K;
}[keyof EventPayloads];

describe('Index Type UT', () => {
  it('should publish only plain data', () => {
    const notPlainEvent: [NotPlainEvent] extends [never] ? true : NotPlainEvent = true;
    const checks: boolean[] = [
      false satisfies IsPlain<{ node: { getContext(): string } }>,
      true satisfies IsPlain<JournalEntry>,
      true satisfies IsPlain<JournalFile>,
      true satisfies IsPlain<JournalHeader>,
      true satisfies IsPlain<RecordedError>,
      true satisfies IsPlain<TerraformLogFile>,
      true satisfies IsPlain<TerraformLogRecord>,
    ];

    expect([notPlainEvent, ...checks]).toEqual([true, false, true, true, true, true, true, true]);
  });

  it('should spell each closed set of a payload as its values', () => {
    const action: EventPayloads['ResourceActionCompletedTransactionEvent']['action'] = 'add';
    const octoAction: EventPayloads['ValidateModeCompletedEvent']['report']['intentChanges'][number]['octoAction'] =
      'replace';

    expect([action, octoAction]).toEqual(['add', 'replace']);
  });
});
