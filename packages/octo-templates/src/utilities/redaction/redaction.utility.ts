import { AWS_ACCOUNT_ID_RULE, AWS_RESOURCE_ID_RULE, IP_ADDRESS_RULE } from './rules/index.js';

/**
 * One kind of value that must never reach a committed file, and what stands in for it.
 *
 * A rule carrying a `token` is substituted wherever it matches. A rule carrying `null` names its
 * value from the context it sits in instead, which only
 * [ResourceAliasUtility](./resource-alias.utility.ts) can do, so this file only detects those.
 */
export interface IRedactionRule {
  /**
   * What the rule is called, in a failure a reader has to act on.
   */
  name: string;

  /**
   * Every shape the value takes. A rule with a `token` captures the text leading up to the value as
   * group one, so the substitution can put it back; a rule without one matches the value alone.
   */
  patterns: RegExp[];

  /**
   * Fragments a match may carry and still be allowed through, e.g. a documentation placeholder.
   */
  placeholders: string[];

  /**
   * The fixed replacement, or `null` when the value is named from its context instead.
   */
  token: string | null;
}

const ALL_RULES: IRedactionRule[] = [AWS_ACCOUNT_ID_RULE, AWS_RESOURCE_ID_RULE, IP_ADDRESS_RULE];

/**
 * Replaces values that must not be committed with a fixed token.
 *
 * The rules under `rules/` are the whole of what this repository considers unsafe to commit, and are
 * shared with the scan over tracked files, so a new cloud is one rule file rather than a new utility
 * and a second copy of its patterns somewhere else.
 */
export class RedactionUtility {
  /**
   * The matches of `rules` in one value, ignoring the fragments those rules allow.
   */
  static findMatches(value: string, rules: IRedactionRule[]): string[] {
    return rules.flatMap((rule) =>
      rule.patterns.flatMap((pattern) =>
        [...value.matchAll(pattern)]
          .map((match) => match[0])
          .filter((match) => !rule.placeholders.some((placeholder) => match.includes(placeholder))),
      ),
    );
  }

  /**
   * Whether the given string carries a value this utility would replace.
   */
  static hasSecret(value: string): boolean {
    return RedactionUtility.redact(value) !== value;
  }

  /**
   * The rules whose values are named from their context rather than replaced by a token.
   */
  static identifierRules(): IRedactionRule[] {
    return ALL_RULES.filter((rule) => rule.token === null);
  }

  /**
   * Returns the given string with every value a redaction rule matches replaced by its token.
   */
  static redact(value: string): string {
    return RedactionUtility.redactionRules().reduce(
      (redacted, rule) =>
        rule.patterns.reduce(
          (substituted, pattern) =>
            substituted.replace(pattern, (match: string, prefix: string) =>
              rule.placeholders.some((placeholder) => match.includes(placeholder))
                ? match
                : `${prefix ?? ''}${rule.token}`,
            ),
          redacted,
        ),
      value,
    );
  }

  /**
   * The rules whose values carry a fixed replacement.
   */
  static redactionRules(): IRedactionRule[] {
    return ALL_RULES.filter((rule) => rule.token !== null);
  }
}
