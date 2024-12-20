import { jest } from '@jest/globals';
import {
  SharedTestResource,
  TestResource,
  TestResourceWithDiffOverride,
} from '../utilities/test-helpers/test-classes.js';
import { commitResources, createTestResources } from '../utilities/test-helpers/test-models.js';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { ResourceDataRepository } from './resource-data.repository.js';

describe('ResourceDataRepository UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    const resourceDataRepository = await container.get(ResourceDataRepository);

    const resourceSerializationService = new ResourceSerializationService(resourceDataRepository);
    resourceSerializationService.registerClass('@octo/SharedTestResource', SharedTestResource);
    resourceSerializationService.registerClass('@octo/TestResource', TestResource);
    resourceSerializationService.registerClass('@octo/TestResourceWithDiffOverride', TestResourceWithDiffOverride);
    container.unRegisterFactory(ResourceSerializationService);
    container.registerValue(ResourceSerializationService, resourceSerializationService);
  });

  afterEach(async () => {
    await TestContainer.reset();

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
           "node": "@octo/test-resource=resource-1",
           "value": "@octo/test-resource=resource-1",
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
           "node": "@octo/test-resource=resource-1",
           "value": "@octo/test-resource=resource-1",
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

      resource1 = resourceDataRepository.getNewResourceByContext(
        '@octo/test-resource=resource-1',
      ) as TestResourceWithDiffOverride;
      const diffOverrideSpy = jest.spyOn(resource1, 'diff');
      await resourceDataRepository.diff();

      expect(diffOverrideSpy).toHaveBeenCalledTimes(1);
      expect(diffOverrideSpy.mock.calls[0]).toHaveLength(1);
      expect((diffOverrideSpy.mock.calls[0] as any)[0].resourceId).toBe('resource-1');
    });
  });
});
