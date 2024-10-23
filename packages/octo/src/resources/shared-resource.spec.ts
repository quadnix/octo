import type { SharedTestResource } from '../../test/helpers/test-classes.js';
import { createTestResources } from '../../test/helpers/test-models.js';
import { TestContainer } from '../functions/container/test-container.js';
import { ResourceDataRepository } from './resource-data.repository.js';

describe('SharedResource UT', () => {
  beforeEach(async () => {
    const resourceDataRepository = new ResourceDataRepository([], [], []);

    await TestContainer.create(
      {
        mocks: [
          {
            type: ResourceDataRepository,
            value: resourceDataRepository,
          },
        ],
      },
      {
        factoryTimeoutInMs: 500,
      },
    );
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  describe('diff()', () => {
    it('should not diff shared resource', async () => {
      const [, sharedResource1] = await createTestResources(
        { 'resource-1': [] },
        { 'shared-resource-1': ['resource-1'] },
      );

      const diffs = await (sharedResource1 as SharedTestResource).diff();

      expect(diffs).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('getSharedResource()', () => {
    it('should not return shared resource', async () => {
      const [, sharedResource1] = await createTestResources(
        { 'resource-1': [] },
        { 'shared-resource-1': ['resource-1'] },
      );

      expect(sharedResource1.getSharedResource()).toBeUndefined();
    });
  });

  describe('merge()', () => {
    it('should merge previous shared resource with self and return new shared resource', async () => {
      const [, resource2, sharedResource1] = await createTestResources(
        { 'resource-1': [], 'resource-2': [] },
        { 'shared-resource-1': ['resource-1'] },
      );
      sharedResource1.properties['property-1'] = 'property-value-1';
      sharedResource1.properties['property-2'] = 'property-value-3';
      sharedResource1.response['response-1'] = 'response-value-1';

      // Create another shared shared.
      const [sharedResource2] = await createTestResources({}, { 'shared-resource-1': [resource2] });
      sharedResource2.properties['property-2'] = 'property-value-2';
      sharedResource2.response['response-2'] = 'response-value-2';

      // Merge sharedResource1 and sharedResource2.
      expect(sharedResource1.getDependencies()).toHaveLength(1);
      (sharedResource1 as SharedTestResource).merge(sharedResource2 as SharedTestResource);
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
