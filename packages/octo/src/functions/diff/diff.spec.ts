import { createResource } from '../../utilities/test-helpers/test-resources.js';
import { Diff, DiffAction } from './diff.js';
import { DiffUtility } from './diff.utility.js';

const TestResource = createResource('test-resource').setClassName('TestResource');

describe('Diff UT', () => {
  describe('toJSON()', () => {
    it('should not include reason key when no reason is provided', () => {
      const resource = new TestResource('resource-1', {}, []);
      const diff = new Diff(resource, DiffAction.ADD, 'field', 'value');

      const json = diff.toJSON();
      expect('reason' in json).toBe(false);
      expect(json).toEqual({
        action: 'add',
        field: 'field',
        node: '@octo/test-resource=resource-1',
        value: 'value',
      });
    });

    it('should include reason key when a reason is provided', () => {
      const resource = new TestResource('resource-1', {}, []);
      const diff = new Diff(resource, DiffAction.ADD, 'field', 'value', 'because reasons');

      const json = diff.toJSON();
      expect(json.reason).toBe('because reasons');
      expect(json).toEqual({
        action: 'add',
        field: 'field',
        node: '@octo/test-resource=resource-1',
        reason: 'because reasons',
        value: 'value',
      });
    });
  });

  describe('isObjectDeepEquals()', () => {
    it('should treat two otherwise-identical diffs as equal regardless of reason', () => {
      const resource = new TestResource('resource-1', {}, []);
      const withReason = new Diff(resource, DiffAction.ADD, 'field', 'value', 'reason a');
      const withDifferentReason = new Diff(resource, DiffAction.ADD, 'field', 'value', 'reason b');
      const withoutReason = new Diff(resource, DiffAction.ADD, 'field', 'value');

      expect(DiffUtility.isObjectDeepEquals(withReason, withDifferentReason)).toBe(true);
      expect(DiffUtility.isObjectDeepEquals(withReason, withoutReason)).toBe(true);
    });

    it('should still treat diffs differing in a real field as unequal', () => {
      const resource = new TestResource('resource-1', {}, []);
      const diff1 = new Diff(resource, DiffAction.ADD, 'field', 'value-1', 'same reason');
      const diff2 = new Diff(resource, DiffAction.ADD, 'field', 'value-2', 'same reason');

      expect(DiffUtility.isObjectDeepEquals(diff1, diff2)).toBe(false);
    });
  });
});
