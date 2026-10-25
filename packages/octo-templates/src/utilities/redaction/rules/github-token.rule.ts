import type { IRedactionRule } from '../redaction.utility.js';

/**
 * A GitHub token: a classic or OAuth token, e.g. `ghp_…`, or a fine-grained one, `github_pat_…`.
 */
export const GITHUB_TOKEN_RULE: IRedactionRule = {
  name: 'GitHub token',
  patterns: [/()\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g],
  placeholders: [],
  token: '<GITHUB_TOKEN>',
};
