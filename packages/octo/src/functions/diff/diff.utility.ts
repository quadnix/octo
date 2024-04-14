import { UnknownModel } from '../../app.type.js';
import { Diff, DiffAction } from './diff.js';

export class DiffUtility {
  private static generateDeleteDiff(model: UnknownModel, field: string): Diff[] {
    const diff: Diff[] = [];

    const children = model.getChildren();
    for (const modelName of Object.keys(children)) {
      for (const dependency of children[modelName]) {
        const child = dependency.to;
        const childField = dependency.getRelationship()!.toField;
        diff.push(...DiffUtility.generateDeleteDiff(child, childField));
      }
    }

    diff.push(new Diff(model, DiffAction.DELETE, field, model[field]));
    return diff;
  }

  // Source: https://stackoverflow.com/a/32922084/1834562
  static isObjectDeepEquals(x: object, y: object): boolean {
    const ok = Object.keys,
      tx = typeof x,
      ty = typeof y;
    return x && y && tx === 'object' && tx === ty
      ? ok(x).length === ok(y).length && ok(x).every((key) => this.isObjectDeepEquals(x[key], y[key]))
      : x === y;
  }

  /**
   * Generate a deep diff of an array of basic types from the previous model vs the latest model.
   * @param a previous model.
   * @param b latest model.
   * @param field string representing the field parent uses to reference the array.
   */
  static diffArray(a: UnknownModel, b: UnknownModel, field: string): Diff[] {
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
   * Generate a deep diff of an array of objects from the previous model vs the latest model.
   * @param a previous model.
   * @param b latest model.
   * @param field string representing the field parent uses to reference the array.
   * @param compare function to check if two objects are equal.
   */
  static diffArrayOfObjects(
    a: UnknownModel,
    b: UnknownModel,
    field: string,
    compare: (object1, object2) => boolean,
  ): Diff[] {
    const diff: Diff[] = [];

    // Iterate elements of previous (a). If found in latest (b), consider it an UPDATE.
    // If not found in latest (b), consider it a DELETE.
    for (const aObject of a[field]) {
      if (b[field].some((bObject) => compare(aObject, bObject))) {
        diff.push(new Diff(b, DiffAction.UPDATE, field, aObject));
      } else {
        diff.push(...DiffUtility.generateDeleteDiff(a, field));
      }
    }

    // Iterate elements of latest (b). If not found in previous (a), consider it an ADD.
    for (const bObject of b[field]) {
      if (!a[field].some((aObject) => compare(aObject, bObject))) {
        diff.push(new Diff(b, DiffAction.ADD, field, bObject));
      }
    }

    return diff;
  }

  /**
   * Generate a deep diff of a map of basic types from the previous model vs the latest model.
   * @param a previous model.
   * @param b latest model.
   * @param field string representing the field parent uses to reference the map.
   */
  static diffMap(a: UnknownModel, b: UnknownModel, field: string): Diff[] {
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
   * Generate a deep diff of an array of previous models vs latest models.
   * The diff is generated recursively, i.e. all children of the model are included in the diff.
   * @param a array of previous models.
   * @param b array of latest models.
   * @param field string representing the unique identifier of the model.
   */
  static async diffModels(a: UnknownModel[], b: UnknownModel[], field: string): Promise<Diff[]> {
    const diff: Diff[] = [];

    // Iterate fields of previous (a). If found in latest (b), get recursive diff of children of b vs a.
    // If not found in latest (b), consider it a DELETE.
    for (const x of a) {
      const y = b.find((i) => i[field] === x[field]);
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
      if (!a.find((i) => i[field] === y[field])) {
        diff.push(new Diff(y, DiffAction.ADD, field, y[field]));

        const pDiff = await y.diff();
        diff.push(...pDiff);
      }
    }

    return diff;
  }
}
