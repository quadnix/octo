import { ANode } from '../../functions/node/node.abstract.js';

/**
 * @internal
 */
export class ObjectUtility {
  /**
   * Copies plain objects and arrays at every depth, and keeps everything else, a function included,
   * by reference. A key holding `undefined` is left out, as a JSON copy leaves it out.
   *
   * @internal
   */
  static deepCopy<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((entry) => ObjectUtility.deepCopy(entry)) as T;
    }
    if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, entry]) => entry !== undefined)
          .map(([key, entry]) => [key, ObjectUtility.deepCopy(entry)]),
      ) as T;
    }
    return value;
  }

  // Source: https://stackoverflow.com/a/58496119/1834562
  /**
   * @internal
   */
  static deepFreeze<T extends object>(object: T): void {
    Object.freeze(object);
    Object.values(object)
      .filter((x) => !Object.isFrozen(x))
      .forEach(ObjectUtility.deepFreeze);
  }

  /**
   * @internal
   */
  static deepMergeInPlace(target: object, source: object): void {
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (this.isPlainObject(sourceValue) && this.isPlainObject(targetValue)) {
        this.deepMergeInPlace(targetValue, sourceValue);
      } else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
        target[key] = [...new Set([...targetValue, ...sourceValue].map((entry) => JSON.stringify(entry)))].map(
          (entryString) => JSON.parse(entryString),
        );
      } else {
        target[key] = sourceValue;
      }
    }
  }

  /**
   * @internal
   */
  static isPlainObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /**
   * @internal
   */
  static onEveryNestedKey(object: object, callback: (parent: object, key: string, value: unknown) => void): void {
    const keys = object instanceof ANode ? Object.keys(object.synth()) : Object.keys(object);
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        const value = object[key];

        if (typeof value === 'object' && value !== null) {
          ObjectUtility.onEveryNestedKey(value, callback);
        } else {
          callback(object, key, value);
        }
      }
    }
  }
}
