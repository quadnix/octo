import { expect } from '@jest/globals';
import { AwsAccountRedactionUtility } from './aws-account-redaction.utility.js';

// Snapshots are committed, and a validate report captured from a live run carries the AWS account
// the suite ran against. Redact on the way into the snapshot file.
expect.addSnapshotSerializer({
  serialize: (value, config, indentation, depth, refs, printer): string =>
    printer(AwsAccountRedactionUtility.redact(value as string), config, indentation, depth, refs),
  test: (value): boolean => typeof value === 'string' && AwsAccountRedactionUtility.hasAccountId(value),
});
