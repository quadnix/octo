import { createHash } from 'node:crypto';

/**
 * @internal
 */
export class StringUtility {
  /**
   * Produces a short deterministic hash of a value, with object keys sorted recursively,
   * so the hash does not change when key insertion order does.
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
   * Replaces every character that is not a letter, digit, underscore, or dash with an underscore.
   * Suitable for terraform identifiers (resource names, output names), which allow dashes.
   */
  static sanitizeForIdentifier(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Replaces every character that is not a letter, digit, or underscore with an underscore.
   * Suitable for names that travel through environment variables (e.g. terraform variables,
   * which terragrunt passes as `TF_VAR_<name>`), where dashes are not allowed.
   */
  static sanitizeForEnvironmentVariable(value: string): string {
    return value.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}
