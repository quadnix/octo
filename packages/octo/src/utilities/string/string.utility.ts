import { createHash } from 'node:crypto';

/**
 * String helpers for module and resource authors: hashing values into stable ids, fitting names into
 * a provider's length limit, and making names safe for terraform.
 *
 * @group Utilities/String
 */
export class StringUtility {
  /**
   * Shortens a name to at most `maxLength` characters, replacing what is cut with a digest of the whole
   * name. Two names that differ anywhere still differ after shortening, and the same name always
   * shortens the same way. A name already within the limit is returned as it is.
   *
   * Use it where a provider limits a name that is built by joining others, e.g. a distribution name and
   * an origin id, so that cutting the tail alone could make two names collide.
   *
   * @example
   * ```ts
   * StringUtility.boundedName('my-distribution-with-a-very-long-origin-id', 20);
   * // The first 11 characters, a dash and 8 hex characters: 20 in all.
   * ```
   */
  static boundedName(name: string, maxLength: number): string {
    if (name.length <= maxLength) {
      return name;
    }

    const digest = StringUtility.deterministicHash(name).substring(0, 8);
    return `${name.substring(0, maxLength - digest.length - 1)}-${digest}`;
  }

  /**
   * Produces a 16-character hex hash of any value, with object keys sorted recursively, so the hash
   * does not change when key insertion order does. Hash several parts as an array,
   * `deterministicHash([bucketName, accessPrefix])`, which keeps `['ab', 'c']` and `['a', 'bc']` apart.
   * Take a prefix of it where a shorter id is enough.
   */
  static deterministicHash(value: unknown): string {
    const stableStringify = (v: unknown): string => {
      if (v === null || typeof v !== 'object') {
        return JSON.stringify(v);
      }
      if (Array.isArray(v)) {
        return `[${v.map(stableStringify).join(',')}]`;
      }
      const keys = Object.keys(v as Record<string, unknown>).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(',')}}`;
    };
    return createHash('sha256').update(stableStringify(value)).digest('hex').substring(0, 16);
  }

  /**
   * Replaces every character that is not a letter, digit, or underscore with an underscore.
   * Suitable for names that travel through environment variables (e.g. terraform variables,
   * which terragrunt passes as `TF_VAR_<name>`), where dashes are not allowed.
   */
  static sanitizeForEnvironmentVariable(value: string): string {
    return value.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Replaces every character that is not a letter, digit, underscore, or dash with an underscore.
   * Suitable for terraform identifiers (resource names, output names), which allow dashes.
   */
  static sanitizeForIdentifier(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}
