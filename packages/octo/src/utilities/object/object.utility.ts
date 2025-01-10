import { ANode } from '../../functions/node/node.abstract.js';

export class ObjectUtility {
  // Source: https://stackoverflow.com/a/58496119/1834562
  static deepFreeze<T extends object>(object: T): void {
    Object.freeze(object);
    Object.values(object)
      .filter((x) => !Object.isFrozen(x))
      .forEach(ObjectUtility.deepFreeze);
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
