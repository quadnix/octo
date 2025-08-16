import type { UnknownNode } from '../../app.type.js';
import { AAnchor } from '../../overlays/anchor.abstract.js';
import { Dependency } from '../dependency/dependency.js';
import { ANode } from '../node/node.abstract.js';
import { Diff, DiffAction } from './diff.js';

export class DiffUtility {
  private static generateDeleteDiff(node: UnknownNode, field: string): Diff[] {
    const diff: Diff[] = [];

    const children = node.getChildren();
    for (const name of Object.keys(children)) {
      for (const dependency of children[name]) {
        const child = dependency.to;
        const childField = dependency.getRelationship()!.toField;
        diff.push(...DiffUtility.generateDeleteDiff(child, childField));
      }
    }

    diff.push(new Diff(node, DiffAction.DELETE, field, node[field]));
    return diff;
  }

  // Source: https://stackoverflow.com/a/32922084/1834562
  static isObjectDeepEquals(x: unknown, y: unknown, excludePaths: string[] = [], currentPath: string[] = []): boolean {
    if (x instanceof AAnchor && y instanceof AAnchor) {
      return this.isObjectDeepEquals(x.synth(), y.synth(), excludePaths, currentPath);
    } else if (x instanceof ANode && y instanceof ANode) {
      return this.isObjectDeepEquals(x.synth(), y.synth(), excludePaths, currentPath);
    } else if (x instanceof Dependency && y instanceof Dependency) {
      return this.isObjectDeepEquals(x.synth(), y.synth(), excludePaths, currentPath);
    } else if (x instanceof Diff && y instanceof Diff) {
      return this.isObjectDeepEquals(x.toJSON(), y.toJSON(), excludePaths, currentPath);
    }

    const ok = Object.keys,
      tx = typeof x,
      ty = typeof y;

    return x && y && tx === 'object' && tx === ty
      ? ok(x).length === ok(y).length &&
          ok(x).every((key) => {
            if (excludePaths.includes([...currentPath, key].join('.'))) {
              return true;
            }
            return this.isObjectDeepEquals(x[key], y[key], excludePaths, [...currentPath, key]);
          })
      : x === y;
  }

  /**
   * Generate a deep diff of an array of basic types from the previous node vs the latest node.
   * @param a previous node.
   * @param b latest node.
   * @param field string representing the field parent uses to reference the array.
   */
  static diffArray(a: UnknownNode, b: UnknownNode, field: string): Diff[] {
    const diff: Diff[] = [];
    const aSet = new Set(a[field]);
    const bSet = new Set(b[field]);

    // Iterate elements of previous (a). If found in latest (b), consider it an UPDATE.
    // If not found in latest (b), consider it a DELETE.
    for (const element of aSet) {
      if (bSet.has(element)) {
        diff.push(new Diff(b, DiffAction.UPDATE, field, element));
      } else {
        diff.push(new Diff(a, DiffAction.DELETE, field, element));
      }
    }

    // Iterate elements of latest (b). If not found in previous (a), consider it an ADD.
    for (const element of bSet) {
      if (!aSet.has(element)) {
        diff.push(new Diff(b, DiffAction.ADD, field, element));
      }
    }

    return diff;
  }

  /**
   * Generate a deep diff of an array of objects from the previous node vs the latest node.
   * @param a previous node.
   * @param b latest node.
   * @param field string representing the field parent uses to reference the array.
   * @param compare function to check if two objects are equal.
   */
  static diffArrayOfObjects(
    a: UnknownNode,
    b: UnknownNode,
    field: string,
    compare: (object1: unknown, object2: unknown) => boolean,
  ): Diff[] {
    const diff: Diff[] = [];

    // Iterate elements of previous (a). If found in latest (b), consider it an UPDATE.
    // If not found in latest (b), consider it a DELETE.
    for (const aObject of a[field]) {
      if (b[field].some((bObject: unknown) => compare(aObject, bObject))) {
        diff.push(new Diff(b, DiffAction.UPDATE, field, aObject));
      } else {
        diff.push(new Diff(a, DiffAction.DELETE, field, aObject));
      }
    }

    // Iterate elements of latest (b). If not found in previous (a), consider it an ADD.
    for (const bObject of b[field]) {
      if (!a[field].some((aObject: unknown) => compare(aObject, bObject))) {
        diff.push(new Diff(b, DiffAction.ADD, field, bObject));
      }
    }

    return diff;
  }

  /**
   * Generate a deep diff of a map of basic types from the previous node vs the latest node.
   * @param a previous node.
   * @param b latest node.
   * @param field string representing the field parent uses to reference the map.
   */
  static diffMap(a: UnknownNode, b: UnknownNode, field: string): Diff[] {
    const diff: Diff[] = [];

    // Iterate fields of previous (a). If found in latest (b), consider it an UPDATE.
    // If not found in latest (b), consider it a DELETE.
    for (const [key, value] of a[field]) {
      if (b[field].has(key)) {
        if (b[field].get(key) !== value) {
          diff.push(new Diff(b, DiffAction.UPDATE, field, { key, value: b[field].get(key) }));
        }
      } else {
        diff.push(new Diff(a, DiffAction.DELETE, field, { key, value }));
      }
    }

    // Iterate fields of latest (b). If not found in previous (a), consider it an ADD.
    for (const [key, value] of b[field]) {
      if (!a[field].has(key)) {
        diff.push(new Diff(b, DiffAction.ADD, field, { key, value }));
      }
    }

    return diff;
  }

  /**
   * Generate a deep diff of an array of previous node vs latest node.
   * The diff is generated recursively, i.e. all children of the node are included in the diff.
   * @param a array of previous nodes.
   * @param b array of latest nodes.
   * @param field string representing the unique identifier of the node.
   */
  static async diffNodes(a: UnknownNode[], b: UnknownNode[], field: string): Promise<Diff[]> {
    const diff: Diff[] = [];

    // Iterate fields of previous (a). If found in latest (b), get recursive diff of children of b vs a.
    // If not found in latest (b), consider it a DELETE.
    for (const x of a) {
      const y = b.find((i) => i.getContext() === x.getContext());
      if (y) {
        const pDiff = await y.diff(x);
        diff.push(...pDiff);
      } else {
        diff.push(...DiffUtility.generateDeleteDiff(x, field));
      }
    }

    // Iterate fields of latest (b). If not found in previous (a), consider it an ADD.
    // Recursively add all children of b.
    for (const y of b) {
      if (!a.find((i) => i.getContext() === y.getContext())) {
        const pDiff = await y.diff();
        diff.push(...pDiff);
      }
    }

    return diff;
  }

  /**
   * Generate a deep diff of an object from the previous node vs the latest node.
   * @param a previous node.
   * @param b latest node.
   * @param field string representing the field parent uses to reference the object.
   */
  static diffObject(a: UnknownNode, b: UnknownNode, field: string): Diff[] {
    const diff: Diff[] = [];

    // Iterate fields of previous (a). If found in latest (b), consider it an UPDATE.
    // If not found in latest (b), consider it a DELETE.
    for (const [key, value] of Object.entries(a[field])) {
      if (Object.prototype.hasOwnProperty.call(b[field], key)) {
        if (typeof b[field][key] === 'object') {
          if (!DiffUtility.isObjectDeepEquals(b[field][key], value)) {
            diff.push(new Diff(b, DiffAction.UPDATE, field, { key, value: b[field][key] }));
          }
        } else {
          if (b[field][key] !== value) {
            diff.push(new Diff(b, DiffAction.UPDATE, field, { key, value: b[field][key] }));
          }
        }
      } else {
        diff.push(new Diff(a, DiffAction.DELETE, field, { key, value }));
      }
    }

    // Iterate fields of latest (b). If not found in previous (a), consider it an ADD.
    for (const [key, value] of Object.entries(b[field])) {
      if (!Object.prototype.hasOwnProperty.call(a[field], key)) {
        diff.push(new Diff(b, DiffAction.ADD, field, { key, value }));
      }
    }

    return diff;
  }
}
