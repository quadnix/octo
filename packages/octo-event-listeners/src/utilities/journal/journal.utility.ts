/**
 * Turns event payloads into plain data a journal can hold.
 *
 * @internal
 */
export class JournalUtility {
  /**
   * A copy of `value` holding only plain data. A node becomes its context, a diff its JSON with the
   * names of the actions chosen for it, and an object already on the path `'[Circular]'`. Bytes are
   * dropped.
   *
   * @internal
   */
  static toPlain(value: unknown, path: Set<object> = new Set()): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'function' || typeof value === 'symbol') {
      return undefined;
    }
    if (typeof value !== 'object') {
      return value;
    }

    // Convert the kinds of object octo payloads carry.
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
      return undefined;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    if (value instanceof Error) {
      return { message: value.message, name: value.name };
    }
    if (path.has(value)) {
      return '[Circular]';
    }

    path.add(value);
    try {
      const record = value as Record<string, unknown>;
      if (typeof record.getContext === 'function') {
        return (record.getContext as () => string)();
      }
      if ('actions' in record && 'applyOrder' in record && 'diff' in record && typeof record.toJSON === 'function') {
        return {
          ...(JournalUtility.toPlain((record.toJSON as () => unknown)(), path) as object),
          actions: (record.actions as object[]).map((a) => a.constructor.name),
          applyOrder: record.applyOrder,
        };
      }
      if (typeof record.toJSON === 'function') {
        return JournalUtility.toPlain((record.toJSON as () => unknown)(), path);
      }
      if (value instanceof Map) {
        return Object.fromEntries([...value.entries()].map(([k, v]) => [String(k), JournalUtility.toPlain(v, path)]));
      }
      if (value instanceof Set || Array.isArray(value)) {
        return [...value].map((v) => JournalUtility.toPlain(v, path));
      }

      const plain: Record<string, unknown> = {};
      for (const [key, entryValue] of Object.entries(record)) {
        plain[key] = JournalUtility.toPlain(entryValue, path);
      }
      return plain;
    } finally {
      path.delete(value);
    }
  }
}
