import { jest } from '@jest/globals';
import { SharedTestResource, TestResource, TestResourceWithDiffOverride } from '../../test/helpers/test-classes.js';
import { commitResources, createTestResources } from '../../test/helpers/test-models.js';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { ResourceDataRepository, ResourceDataRepositoryFactory } from './resource-data.repository.js';

describe('ResourceDataRepository UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [],
      },
      {
        factoryTimeoutInMs: 500,
      },
    );

    // In these tests, we commit resources, which resets the ResourceDataRepository.
    // We cannot use TestContainer to mock ResourceDataRepositoryFactory,
    // or else commit of resources won't reset anything.
    container.registerFactory(ResourceDataRepository, ResourceDataRepositoryFactory);
    const resourceDataRepository = await container.get(ResourceDataRepository, { args: [true, [], [], []] });

    const resourceSerializationService = new ResourceSerializationService(resourceDataRepository);
    resourceSerializationService.registerClass('@octo/SharedTestResource', SharedTestResource);
    resourceSerializationService.registerClass('@octo/TestResource', TestResource);
    resourceSerializationService.registerClass('@octo/TestResourceWithDiffOverride', TestResourceWithDiffOverride);
    container.registerValue<ResourceSerializationService>(ResourceSerializationService, resourceSerializationService);
  });

  afterEach(() => {
    TestContainer.reset();

    jest.restoreAllMocks();
  });

  describe('diff()', () => {
    it('should produce an add diff', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      await createTestResources({ 'resource-1': [] });

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "test-resource=resource-1",
           "value": "resource-1",
         },
       ]
      `);
    });

    it('should produce diff of a resource associated with a shared resource using the overridden diff()', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const resource1 = new TestResourceWithDiffOverride('resource-1');
      resourceDataRepository.addNewResource(resource1);
      await createTestResources({}, { 'shared-resource-1': [resource1] });

      const diffOverrideSpy = jest.spyOn(resource1, 'diff');
      await resourceDataRepository.diff();

      expect(diffOverrideSpy).toHaveBeenCalledTimes(1);
      expect(diffOverrideSpy.mock.calls[0]).toHaveLength(1);
      expect((diffOverrideSpy.mock.calls[0] as any)[0].resourceId).toBe('shared-resource-1');
    });

    it('should produce a delete diff', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });

      await commitResources();

      resourceDataRepository.removeNewResource(resource1);

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "test-resource=resource-1",
           "value": "resource-1",
         },
       ]
      `);
    });

    it('should produce an update diff using overridden resource diff()', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      let resource1 = new TestResourceWithDiffOverride('resource-1');
      resourceDataRepository.addNewResource(resource1);

      await commitResources();

      resource1 = new TestResourceWithDiffOverride('resource-1');
      resourceDataRepository.addNewResource(resource1);

      resource1 = resourceDataRepository.getNewResourceById('resource-1') as TestResourceWithDiffOverride;
      const diffOverrideSpy = jest.spyOn(resource1, 'diff');
      await resourceDataRepository.diff();

      expect(diffOverrideSpy).toHaveBeenCalledTimes(1);
      expect(diffOverrideSpy.mock.calls[0]).toHaveLength(1);
      expect((diffOverrideSpy.mock.calls[0] as any)[0].resourceId).toBe('resource-1');
    });
  });
});
