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
});
