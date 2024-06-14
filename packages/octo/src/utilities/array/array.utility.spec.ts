import { ArrayUtility } from './array.utility.js';

describe('ArrayUtility UT', () => {
  describe('intersect()', () => {
    const compareFn = (a: { key: string }, b: { key: string }): boolean => {
      return a.key === b.key;
    };

    it('should throw error if args are not array', () => {
      expect(() => {
        ArrayUtility.intersect<{ key: string }>(
          compareFn,
          1 as unknown as [
            {
              key: string;
            },
          ],
        );
      }).toThrowErrorMatchingInlineSnapshot(`"Cannot intersect non-array elements!"`);
    });

    it('should return an empty array with no args', () => {
      expect(ArrayUtility.intersect<{ key: string }>(compareFn)).toEqual([]);
    });

    it('should return the same array with one arg', () => {
      expect(ArrayUtility.intersect<{ key: string }>(compareFn, [{ key: '1' }])).toEqual([{ key: '1' }]);
    });

    it('should return an empty array when no common elements', () => {
      expect(ArrayUtility.intersect<{ key: string }>(compareFn, [{ key: '1' }], [{ key: '2' }])).toEqual([]);
    });

    it('should return an intersected array with common elements', () => {
      expect(ArrayUtility.intersect<{ key: string }>(compareFn, [{ key: '1' }], [{ key: '1' }])).toEqual([
        { key: '1' },
      ]);
    });

    it('should return an intersected array with common elements in multiple arrays', () => {
      expect(
        ArrayUtility.intersect<{ key: string }>(
          compareFn,
          [{ key: '1' }, { key: '2' }, { key: '3' }],
          [{ key: '3' }, { key: '4' }, { key: '5' }],
          [{ key: '5' }, { key: '6' }, { key: '3' }],
        ),
      ).toEqual([{ key: '3' }]);
    });
  });
});
