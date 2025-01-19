import { createTestResources } from '../test-helpers/test-models.js';
import { NodeUtility } from './node.utility.js';

describe('NodeUtility UT', () => {
  describe('sortResourcesByDependency()', () => {
    it('should sort resources by dependency', async () => {
      const [resource1, resource2, resource3, resource4] = await createTestResources({
        'resource-1': [],
        'resource-2': ['resource-1'],
        'resource-3': ['resource-1', 'resource-2'],
        'resource-4': ['resource-3'],
      });

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
