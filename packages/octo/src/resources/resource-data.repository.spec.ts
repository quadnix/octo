import { jest } from '@jest/globals';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { commitResources, createTestResources } from '../utilities/test-helpers/test-resources.js';
import { ResourceDataRepository } from './resource-data.repository.js';

describe('ResourceDataRepository UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500, force: true });
  });

  afterEach(async () => {
    await TestContainer.reset();

    jest.restoreAllMocks();
  });

  describe('diff()', () => {
    it('should produce an add diff', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      await createTestResources([{ resourceContext: '@octo/test-resource=resource-1' }]);

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/test-resource=resource-1",
           "value": "@octo/test-resource=resource-1",
         },
       ]
      `);
    });

    it('should produce an add diff of a resource associated with another resource', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      await createTestResources([
        {
          resourceContext: '@octo/test-resource=resource-1',
        },
        {
          parents: ['@octo/test-resource=resource-1'],
          resourceContext: '@octo/test-resource=resource-2',
        },
      ]);

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/test-resource=resource-1",
           "value": "@octo/test-resource=resource-1",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/test-resource=resource-2",
           "value": "@octo/test-resource=resource-2",
         },
       ]
      `);
    });

    it('should produce a delete diff', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);

      await commitResources();

      resourceDataRepository.removeNewResource(resource1);

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/test-resource=resource-1",
           "value": "@octo/test-resource=resource-1",
         },
       ]
      `);
    });

    it('should produce an update diff using resource diff()', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      await createTestResources([{ resourceContext: '@octo/test-resource=resource-1' }]);
      await commitResources();
      await createTestResources([{ resourceContext: '@octo/test-resource=resource-1' }]);

      const resource1 = resourceDataRepository.getNewResourceByContext('@octo/test-resource=resource-1');
      const diffOverrideSpy = jest.spyOn(resource1!, 'diff');
      await resourceDataRepository.diff();

      expect(diffOverrideSpy).toHaveBeenCalledTimes(1);
      expect(diffOverrideSpy.mock.calls[0]).toHaveLength(1);
      expect((diffOverrideSpy.mock.calls[0] as any)[0].resourceId).toBe('resource-1');
    });
  });

  describe('syncActualToNew()', () => {
    it('should drop a resource that left intent', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      await createTestResources([{ resourceContext: '@octo/test-resource=resource-1' }]);
      await commitResources();

      resourceDataRepository.syncActualToNew();

      expect(resourceDataRepository.getActualResourcesByProperties()).toHaveLength(0);
    });

    it('should retain a resource, and the parents it deserializes with, in both graphs', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
      ]);
      await commitResources();

      resourceDataRepository.syncActualToNew(new Set(), new Set(['@octo/test-resource=resource-2']));

      expect(
        resourceDataRepository
          .getActualResourcesByProperties()
          .map((r) => r.getContext())
          .sort(),
      ).toEqual(['@octo/test-resource=resource-1', '@octo/test-resource=resource-2']);
      expect(resourceDataRepository.getNewResourceByContext('@octo/test-resource=resource-2')).toBeDefined();
    });
  });
});
