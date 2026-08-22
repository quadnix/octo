import { expect } from '@jest/globals';
import { RedactionUtility } from './redaction.utility.js';

// Snapshots are committed, and output captured from a live run carries values that identify the
// account it ran against. Redact on the way into the snapshot file.
expect.addSnapshotSerializer({
  serialize: (value, config, indentation, depth, refs, printer): string =>
    printer(RedactionUtility.redact(value as string), config, indentation, depth, refs),
  test: (value): boolean => typeof value === 'string' && RedactionUtility.hasSecret(value),
});
