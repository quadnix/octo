import type { IRedactionRule } from '../redaction.utility.js';

/**
 * An AWS access key, e.g. `AKIAIOSFODNN7EXAMPLE`, or the secret key paired with it.
 *
 * A secret key has no shape of its own, so it is matched only after a key naming it. The values AWS
 * documents as examples are allowed.
 */
export const AWS_CREDENTIAL_RULE: IRedactionRule = {
  name: 'AWS credential',
  patterns: [
    // An access key id, long-term or temporary, e.g. "AKIAIOSFODNN7EXAMPLE".
    /()\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    // A secret key after its name, e.g. "aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".
    /((?:aws_secret_access_key|secret_?access_?key)['"]?\s*[:=]\s*['"]?)[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])/gi,
  ],
  placeholders: ['AKIAIOSFODNN7EXAMPLE', 'EXAMPLEKEY'],
  token: '<AWS_CREDENTIAL>',
};
