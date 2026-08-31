import type { IRedactionRule } from '../redaction.utility.js';

/**
 * An AWS-assigned resource identifier: a lowercase type prefix and a hexadecimal suffix, e.g.
 * `subnet-013a66645b3b4cd15`.
 *
 * Detected rather than replaced, because a snapshot that collapsed every subnet to one token would
 * match even when two of them were confused. `…0123456789abcdef0` is terragrunt's own mock output
 * and is already stable.
 */
export const AWS_RESOURCE_ID_RULE: IRedactionRule = {
  name: 'AWS resource id',
  patterns: [/\b[a-z]+(?:-[a-z]+)*-[0-9a-f]{8,17}\b/g],
  placeholders: ['0123456789abcdef0'],
  token: null,
};
