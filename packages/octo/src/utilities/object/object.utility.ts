import { ANode } from '../../functions/node/node.abstract.js';

export class ObjectUtility {
  // Source: https://stackoverflow.com/a/58496119/1834562
  static deepFreeze<T extends object>(object: T): void {
    Object.freeze(object);
    Object.values(object)
      .filter((x) => !Object.isFrozen(x))
      .forEach(ObjectUtility.deepFreeze);
  }

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

  static isPlainObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  static onEveryNestedKey(object: object, callback: (parent: object, key: string, value: unknown) => void): void {
    const keys = object instanceof ANode ? Object.keys(object.synth()) : Object.keys(object);
    for (const key of keys) {
      if (object.hasOwnProperty(key)) {
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
