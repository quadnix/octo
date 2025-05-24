import { TestResource } from '../test-helpers/test-classes.js';
import { ObjectUtility } from './object.utility.js';

describe('Object Utility Test', () => {
  describe('deepFreeze()', () => {
    it('should deep freeze arrays', () => {
      const subject1 = [1, 2, 3];
      ObjectUtility.deepFreeze(subject1);
      expect(Object.isFrozen(subject1)).toBe(true);

      const subject2 = [1, [2, 2], 3];
      ObjectUtility.deepFreeze(subject2);
      expect(Object.isFrozen(subject2[1])).toBe(true);

      const subject3 = [{ a: 1, b: 2 }, 3];
      ObjectUtility.deepFreeze(subject3);
      expect(Object.isFrozen(subject3[0])).toBe(true);
    });

    it('should deep freeze objects', () => {
      const subject1 = { a: 1, b: 2, c: 3 };
      ObjectUtility.deepFreeze(subject1);
      expect(Object.isFrozen(subject1)).toBe(true);

      const subject2 = { a: 1, b: { c: 3 }, c: 3 };
      ObjectUtility.deepFreeze(subject2);
      expect(Object.isFrozen(subject2.b)).toBe(true);

      const subject3 = { a: 1, b: [{ c: 3 }], c: 3 };
      ObjectUtility.deepFreeze(subject3);
      expect(Object.isFrozen(subject3.b[0])).toBe(true);
    });

    it('should deep freeze functions', () => {
      const subject1 = (): void => {};
      ObjectUtility.deepFreeze(subject1);
      expect(Object.isFrozen(subject1)).toBe(true);
    });

    it('should deep freeze maps', () => {
      const subject1 = new Map();
      ObjectUtility.deepFreeze(subject1);
      expect(Object.isFrozen(subject1)).toBe(true);

      // Maps are not deep frozen.
      const subject2 = new Map();
      subject2.set('a', { b: 1 });
      ObjectUtility.deepFreeze(subject2);
      expect(Object.isFrozen(subject2.get('a'))).toBe(false);
    });

    it('should deep freeze class instances', () => {
      const subject1 = new TestResource('resource-1', { key1: { key2: 'value2' } });
      subject1.response['key3'] = 'value3';
      ObjectUtility.deepFreeze(subject1);
      expect(Object.isFrozen(subject1)).toBe(true);
      expect(Object.isFrozen(subject1.properties)).toBe(true);
      expect(Object.isFrozen(subject1.properties.key1)).toBe(true);
      expect(Object.isFrozen(subject1.response)).toBe(true);
      expect(Object.isFrozen(subject1['anchors'])).toBe(true);
      expect(Object.isFrozen(subject1['dependencies'])).toBe(true);
    });

    it('should deep freeze class instances with circular references', () => {
      const subject1a = new TestResource('resource-1', { key1: { key2: 'value2' } });
      const subject1b = new TestResource('resource-2', { key1: { key2: 'value2' } });
      const subject1c = new TestResource('resource-3', { key1: { key2: 'value2' } });
      subject1a.addChild('resourceId', subject1b, 'resourceId');
      subject1b.addChild('resourceId', subject1c, 'resourceId');
      subject1c.addChild('resourceId', subject1a, 'resourceId');
      ObjectUtility.deepFreeze(subject1a);
      ObjectUtility.deepFreeze(subject1b);
      ObjectUtility.deepFreeze(subject1c);
      expect(Object.isFrozen(subject1a)).toBe(true);
      expect(Object.isFrozen(subject1b)).toBe(true);
      expect(Object.isFrozen(subject1c)).toBe(true);
    });
  });

  describe('deepMergeInPlace()', () => {
    it('should merge plain objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      ObjectUtility.deepMergeInPlace(target, source);
      expect(target).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should merge nested objects', () => {
      const target = { a: { x: 1, y: 2 } };
      const source = { a: { y: 3, z: 4 } };
      ObjectUtility.deepMergeInPlace(target, source);
      expect(target).toEqual({ a: { x: 1, y: 3, z: 4 } });
    });

    it('should merge arrays', () => {
      const target = { a: [1, 2, 3] };
      const source = { a: [3, 4, 5] };
      ObjectUtility.deepMergeInPlace(target, source);
      expect(target).toEqual({ a: [1, 2, 3, 4, 5] });
    });

    it('should merge nested arrays', () => {
      const target = { a: { b: [1, 2] } };
      const source = { a: { b: [2, 3] } };
      ObjectUtility.deepMergeInPlace(target, source);
      expect(target).toEqual({ a: { b: [1, 2, 3] } });
    });

    it('should handle undefined values', () => {
      const target = { a: undefined };
      const source = { b: undefined };
      ObjectUtility.deepMergeInPlace(target, source);
      expect(target).toEqual({ a: undefined, b: undefined });
    });

    it('should handle null values', () => {
      const target = { a: null };
      const source = { b: null };
      ObjectUtility.deepMergeInPlace(target, source);
      expect(target).toEqual({ a: null, b: null });
    });

    it('should handle mixed types', () => {
      const target = { a: 1, b: [1, 2], c: { x: 1 } };
      const source = { b: [2, 3], c: { y: 2 }, d: true };
      ObjectUtility.deepMergeInPlace(target, source);
      expect(target).toEqual({
        a: 1,
        b: [1, 2, 3],
        c: { x: 1, y: 2 },
        d: true,
      });
    });

    it('should not modify source object', () => {
      const target = { a: 1 };
      const source = { b: 2 };
      ObjectUtility.deepMergeInPlace(target, source);
      expect(source).toEqual({ b: 2 });
    });
  });

  describe('isPlainObject()', () => {
    it('should return true for plain objects', () => {
      expect(ObjectUtility.isPlainObject({})).toBe(true);
      expect(ObjectUtility.isPlainObject({ key: 'value' })).toBe(true);
      expect(ObjectUtility.isPlainObject(new Date())).toBe(true);
      expect(ObjectUtility.isPlainObject(new Map())).toBe(true);
      expect(ObjectUtility.isPlainObject(new Set())).toBe(true);
    });

    it('should return false for non-plain objects', () => {
      expect(ObjectUtility.isPlainObject([])).toBe(false);
      expect(ObjectUtility.isPlainObject(null)).toBe(false);
      expect(ObjectUtility.isPlainObject(undefined)).toBe(false);
      expect(ObjectUtility.isPlainObject(42)).toBe(false);
      expect(ObjectUtility.isPlainObject('string')).toBe(false);
      expect(ObjectUtility.isPlainObject(true)).toBe(false);
    });

    it('should return true for class instances', () => {
      class TestClass {}
      expect(ObjectUtility.isPlainObject(new TestClass())).toBe(true);
    });
  });

  describe('onEveryNestedKey()', () => {
    it('should call the callback for every nested key', () => {
      const subject = {
        a: 1,
        b: [2, 3],
        c: {
          d: 4,
          e: {
            f: 5,
          },
        },
      };

      ObjectUtility.onEveryNestedKey(subject, (parent, key, value) => {
        parent[key] = value + ' test';
      });

      expect(subject).toEqual({
        a: '1 test',
        b: ['2 test', '3 test'],
        c: {
          d: '4 test',
          e: {
            f: '5 test',
          },
        },
      });
    });
  });
});
