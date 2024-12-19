import { NodeType, type UnknownSharedResource } from '../app.type.js';
import { TestContainer } from '../functions/container/test-container.js';
import { createTestResources } from '../utilities/test-helpers/test-resources.js';

describe('SharedResource UT', () => {
  beforeEach(async () => {
    await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  describe('diff()', () => {
    it('should not diff shared resource', async () => {
      const { '@octo/test-resource=shared-resource-1': sharedResource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        {
          NODE_TYPE: NodeType.SHARED_RESOURCE,
          parents: ['@octo/test-resource=resource-1'],
          resourceContext: '@octo/test-resource=shared-resource-1',
        },
      ]);

      const diffs = await (sharedResource1 as UnknownSharedResource).diff();

      expect(diffs).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('getSharedResource()', () => {
    it('should not return shared resource', async () => {
      const { '@octo/test-resource=shared-resource-1': sharedResource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        {
          NODE_TYPE: NodeType.SHARED_RESOURCE,
          parents: ['@octo/test-resource=resource-1'],
          resourceContext: '@octo/test-resource=shared-resource-1',
        },
      ]);

      expect(sharedResource1.getSharedResource()).toBeUndefined();
    });
  });

  describe('merge()', () => {
    it('should merge previous shared resource with self and return new shared resource', async () => {
      const { '@octo/test-resource=resource-2': resource2, '@octo/test-resource=shared-resource-1': sharedResource1 } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          { resourceContext: '@octo/test-resource=resource-2' },
          {
            NODE_TYPE: NodeType.SHARED_RESOURCE,
            parents: ['@octo/test-resource=resource-1'],
            properties: { 'property-1': 'property-value-1', 'property-2': 'property-value-3' },
            resourceContext: '@octo/test-resource=shared-resource-1',
            response: { 'response-1': 'response-value-1' },
          },
        ]);

      // Create another shared shared.
      const { '@octo/test-resource=shared-resource-1': sharedResource2 } = await createTestResources([
        {
          NODE_TYPE: NodeType.SHARED_RESOURCE,
          parents: [resource2],
          properties: { 'property-2': 'property-value-2' },
          resourceContext: '@octo/test-resource=shared-resource-1',
          response: { 'response-2': 'response-value-2' },
        },
      ]);

      // Merge sharedResource1 and sharedResource2.
      expect(sharedResource1.getDependencies()).toHaveLength(1);
      (sharedResource1 as UnknownSharedResource).merge(sharedResource2 as UnknownSharedResource);
      expect(sharedResource1.getDependencies()).toHaveLength(2);
      expect(sharedResource1.properties).toMatchInlineSnapshot(`
        {
          "property-1": "property-value-1",
          "property-2": "property-value-3",
        }
      `);
      expect(sharedResource1.response).toMatchInlineSnapshot(`
        {
          "response-1": "response-value-1",
          "response-2": "response-value-2",
        }
      `);
    });
  });
});
