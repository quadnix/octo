import { IModel } from '../../models/model.interface';
import { Diff, DiffAction } from './diff.model';

export class DiffUtility {
  /**
   * Generate a deep diff of an array of previous models vs latest models.
   * The diff is generated recursively, i.e. all children of the model are included in the diff.
   * @param a array of previous models.
   * @param b array of latest models.
   * @param field string representing the field parent uses to reference the models.
   * @param property string representing the unique key of the model.
   */
  static diffModels(
    a: IModel<unknown, unknown>[],
    b: IModel<unknown, unknown>[],
    field: string,
    property: string,
  ): Diff[] {
    const diff: Diff[] = [];

    // Iterate properties of previous (a). If found in latest (b), get recursive diff of children of b vs a.
    // If not found in latest (b), consider it a DELETE.
    for (const x of a) {
      const y = b.find((i) => i[property] === x[property]);
      if (y) {
        const pDiff = y.diff(x);
        diff.push(...pDiff);
      } else {
        diff.push(new Diff(x, DiffAction.DELETE, field, x[property]));
      }
    }

    // Iterate properties of latest (b). If not found in previous (a), consider it an ADD.
    // Recursively add all children of b.
    for (const y of b) {
      if (!a.find((i) => i[property] === y[property])) {
        diff.push(new Diff(y, DiffAction.ADD, field, y[property]));

        const pDiff = y.diff();
        diff.push(...pDiff);
      }
    }

    return diff;
  }

  /**
   * Generate a deep diff of a map from the previous model vs the latest model.
   * @param a previous model.
   * @param b latest model.
   * @param field string representing the field parent uses to reference the map.
   */
  static diffMap(a: IModel<unknown, unknown>, b: IModel<unknown, unknown>, field: string): Diff[] {
    const diff: Diff[] = [];

    // Iterate properties of previous (a). If found in latest (b), consider it an UPDATE.
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

    // Iterate properties of latest (b). If not found in previous (a), consider it an ADD.
    for (const [key, value] of b[field]) {
      if (!a[field].has(key)) {
        diff.push(new Diff(a, DiffAction.ADD, field, { key, value }));
      }
    }

    return diff;
  }
}
