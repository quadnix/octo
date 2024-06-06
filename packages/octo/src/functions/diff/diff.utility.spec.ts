import { type UnknownModel } from '../../app.type.js';
import { DiffUtility } from './diff.utility.js';

describe('Diff Utility UT', () => {
  describe('isObjectDeepEquals()', () => {
    it('should return true when objects are equal', () => {
      expect(DiffUtility.isObjectDeepEquals({ a: 1, b: 2 }, { a: 1, b: 2 })).toEqual(true);
    });

    it('should return false when objects are not equal', () => {
      expect(DiffUtility.isObjectDeepEquals({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(false);
    });

    it('should return true when nested objects are equal', () => {
      expect(DiffUtility.isObjectDeepEquals({ a: 1, b: { c: 3 } }, { a: 1, b: { c: 3 } })).toEqual(true);
    });

    it('should return false when nested objects are not equal', () => {
      expect(DiffUtility.isObjectDeepEquals({ a: 1, b: { c: 3 } }, { a: 1, b: { c: 4 } })).toEqual(false);
    });

    it('should return true when arrays are equal', () => {
      expect(DiffUtility.isObjectDeepEquals([1, 2], [1, 2])).toEqual(true);
    });

    it('should return false when arrays are not equal', () => {
      expect(DiffUtility.isObjectDeepEquals([1, 2], [1, 3])).toEqual(false);
    });

    it('should return true when nested arrays are equal', () => {
      expect(DiffUtility.isObjectDeepEquals([1, [2, 3]], [1, [2, 3]])).toEqual(true);
    });

    it('should return false when nested arrays are not equal', () => {
      expect(DiffUtility.isObjectDeepEquals([1, [2, 3]], [1, [2, 4]])).toEqual(false);
    });

    it('should return true when array of objects are equal', () => {
      expect(DiffUtility.isObjectDeepEquals([{ a: 1 }, { b: 2 }], [{ a: 1 }, { b: 2 }])).toEqual(true);
    });

    it('should return false when array of objects are not equal', () => {
      expect(DiffUtility.isObjectDeepEquals([{ a: 1 }, { b: 2 }], [{ a: 1 }, { b: 3 }])).toEqual(false);
    });

    it('should return true when array of boolean and undefined are equal', () => {
      expect(DiffUtility.isObjectDeepEquals([undefined, false], [undefined, false])).toEqual(true);
    });

    it('should return false when array of boolean and undefined are not equal', () => {
      expect(DiffUtility.isObjectDeepEquals([undefined, false], [null, true])).toEqual(false);
    });
  });

  describe('diffArray()', () => {
    it('should return an update diff when both arrays are equal', () => {
      expect(
        DiffUtility.diffArray(
          { a: [1], b: 2 } as unknown as UnknownModel,
          { a: [1], b: 2 } as unknown as UnknownModel,
          'a',
        ),
      ).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "a",
           "value": 1,
         },
       ]
      `);
    });

    it('should return a delete diff when new array is empty', () => {
      expect(
        DiffUtility.diffArray(
          { a: [1], b: 2 } as unknown as UnknownModel,
          { a: [], b: 2 } as unknown as UnknownModel,
          'a',
        ),
      ).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "a",
           "value": 1,
         },
       ]
      `);
    });

    it('should return an add diff when old array is empty', () => {
      expect(
        DiffUtility.diffArray(
          { a: [], b: 2 } as unknown as UnknownModel,
          { a: [1], b: 2 } as unknown as UnknownModel,
          'a',
        ),
      ).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "a",
           "value": 1,
         },
       ]
      `);
    });
  });

  describe('diffArrayOfObjects()', () => {
    it('should return an update diff when both arrays are equal', () => {
      expect(
        DiffUtility.diffArrayOfObjects(
          { a: [{ a: 1 }], b: 2 } as unknown as UnknownModel,
          { a: [{ a: 1 }], b: 2 } as unknown as UnknownModel,
          'a',
          (object1, object2) => object1.a === object2.a,
        ),
      ).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "a",
           "value": {
             "a": 1,
           },
         },
       ]
      `);
    });

    it('should return a delete diff when new array is empty', () => {
      expect(
        DiffUtility.diffArrayOfObjects(
          { a: [{ a: 1 }], b: 2 } as unknown as UnknownModel,
          { a: [], b: 2 } as unknown as UnknownModel,
          'a',
          (object1, object2) => object1.a === object2.a,
        ),
      ).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "a",
           "value": {
             "a": 1,
           },
         },
       ]
      `);
    });

    it('should return an add diff when old array is empty', () => {
      expect(
        DiffUtility.diffArrayOfObjects(
          { a: [], b: 2 } as unknown as UnknownModel,
          { a: [{ a: 1 }], b: 2 } as unknown as UnknownModel,
          'a',
          (object1, object2) => object1.a === object2.a,
        ),
      ).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "a",
           "value": {
             "a": 1,
           },
         },
       ]
      `);
    });
  });
});
