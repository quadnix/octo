import { createTestResources } from '../test-helpers/test-resources.js';
import { NodeUtility } from './node.utility.js';

describe('NodeUtility UT', () => {
  describe('sortResourcesByDependency()', () => {
    it('should sort resources by dependency', async () => {
      const {
        '@octo/test-resource=resource-1': resource1,
        '@octo/test-resource=resource-2': resource2,
        '@octo/test-resource=resource-3': resource3,
        '@octo/test-resource=resource-4': resource4,
      } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
        {
          parents: ['@octo/test-resource=resource-1', '@octo/test-resource=resource-2'],
          resourceContext: '@octo/test-resource=resource-3',
        },
        { parents: ['@octo/test-resource=resource-3'], resourceContext: '@octo/test-resource=resource-4' },
      ]);

      expect(NodeUtility.sortResourcesByDependency([])).toEqual([]);

      expect(NodeUtility.sortResourcesByDependency([resource1])).toEqual([resource1]);

      expect(NodeUtility.sortResourcesByDependency([resource1, resource2])).toEqual([resource1, resource2]);

      expect(NodeUtility.sortResourcesByDependency([resource2, resource1])).toEqual([resource1, resource2]);

      expect(NodeUtility.sortResourcesByDependency([resource3, resource1, resource2])).toEqual([
        resource1,
        resource2,
        resource3,
      ]);

      expect(NodeUtility.sortResourcesByDependency([resource1, resource3, resource2])).toEqual([
        resource1,
        resource2,
        resource3,
      ]);

      expect(NodeUtility.sortResourcesByDependency([resource3, resource4, resource2, resource1])).toEqual([
        resource1,
        resource2,
        resource3,
        resource4,
      ]);

      expect(NodeUtility.sortResourcesByDependency([resource4, resource1, resource3, resource2])).toEqual([
        resource1,
        resource2,
        resource3,
        resource4,
      ]);

      expect(NodeUtility.sortResourcesByDependency([resource4, resource3, resource2, resource1])).toEqual([
        resource1,
        resource2,
        resource3,
        resource4,
      ]);
    });
  });
});
