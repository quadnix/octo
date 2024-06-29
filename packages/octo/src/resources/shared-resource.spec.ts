import { SharedTestResource, TestResource } from '../../test/helpers/test-classes.js';
import { commitResources, createTestResources } from '../../test/helpers/test-models.js';
import { Container } from '../decorators/container.js';
import {
  ResourceSerializationService,
  ResourceSerializationServiceFactory,
} from '../services/serialization/resource/resource-serialization.service.js';
import { ResourceDataRepository, ResourceDataRepositoryFactory } from './resource-data.repository.js';

describe('SharedResource UT', () => {
  beforeEach(async () => {
    Container.registerFactory(ResourceDataRepository, ResourceDataRepositoryFactory);
    await Container.get(ResourceDataRepository, { args: [true, [], []] });

    Container.registerFactory(ResourceSerializationService, ResourceSerializationServiceFactory);
    const resourceSerializationService = await Container.get(ResourceSerializationService, { args: [true] });
    resourceSerializationService.registerClass('SharedTestResource', SharedTestResource);
    resourceSerializationService.registerClass('TestResource', TestResource);
  });

  afterEach(() => {
    Container.reset();
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

      // Calling getSharedResource() on a shared resource should return undefined.
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

  describe('shared resource serialization and deserialization', () => {
    it('should serialize and deserialize single shared-resource', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      await createTestResources({ 'resource-1': [] }, { 'shared-resource-1': ['resource-1'] });

      await commitResources();

      const previousResources = resourceDataRepository['oldResources'].map((r) => r.synth());
      const currentResources = resourceDataRepository['newResources'].map((r) => r.synth());

      expect(previousResources).toEqual(currentResources);
    });

    it('should serialize and deserialize shared-resources with parent', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [, resource1] = await createTestResources(
        { 'parent-1': [], 'resource-1': ['parent-1'] },
        { 'shared-test-resource': ['resource-1'] },
      );
      resource1.response['response1'] = 'response-value-1';

      await commitResources();

      const previousResources = resourceDataRepository['oldResources'].map((r) => r.synth());
      const currentResources = resourceDataRepository['newResources'].map((r) => r.synth());

      expect(previousResources).toEqual(currentResources);
    });

    it('should serialize and deserialize shared-resources with different parents', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [, , resource1, resource2] = await createTestResources(
        { 'parent-1': [], 'parent-2': [], 'resource-1': ['parent-1'], 'resource-2': ['parent-2'] },
        { 'shared-test-resource': ['resource-1', 'resource-2'] },
      );
      resource1.properties['property1'] = 'property-value-1';
      resource2.properties['property2'] = 'property-value-2';

      await commitResources();

      const previousResources = resourceDataRepository['oldResources'].map((r) => r.synth());
      const currentResources = resourceDataRepository['newResources'].map((r) => r.synth());

      expect(previousResources).toEqual(currentResources);
    });
  });
});
