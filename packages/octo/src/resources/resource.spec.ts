import { jest } from '@jest/globals';
import { SharedTestResource, TestResource, TestResourceWithDiffOverride } from '../../test/helpers/test-classes.js';
import { commitResources, createTestResources } from '../../test/helpers/test-models.js';
import { Container } from '../decorators/container.js';
import {
  ResourceSerializationService,
  ResourceSerializationServiceFactory,
} from '../services/serialization/resource/resource-serialization.service.js';
import { ResourceDataRepository, ResourceDataRepositoryFactory } from './resource-data.repository.js';
import { AResource } from './resource.abstract.js';

describe('Resource UT', () => {
  beforeEach(async () => {
    Container.registerFactory(ResourceDataRepository, ResourceDataRepositoryFactory);
    await Container.get(ResourceDataRepository, { args: [true, [], []] });

    Container.registerFactory(ResourceSerializationService, ResourceSerializationServiceFactory);
    const resourceSerializationService = await Container.get(ResourceSerializationService, { args: [true] });
    resourceSerializationService.registerClass('SharedTestResource', SharedTestResource);
    resourceSerializationService.registerClass('TestResource', TestResource);
    resourceSerializationService.registerClass('TestResourceWithDiffOverride', TestResourceWithDiffOverride);
  });

  afterEach(() => {
    Container.reset();
  });

  it('should be able to associate with another resource as its child', async () => {
    const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });

    expect((resource1.getChildren()['test-resource'][0].to as AResource<TestResource>).resourceId).toBe('resource-2');
    expect((resource2.getParents()['test-resource'][0].to as AResource<TestResource>).resourceId).toBe('resource-1');
  });

  it('should not be able to associate with another resource multiple times', async () => {
    await expect(async () => {
      await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1', 'resource-1'] });
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"Dependency relationship already exists!"`);
  });

  describe('diff()', () => {
    it('should produce an add diff', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      await createTestResources({ 'resource-1': [] });

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "resourceId",
           "model": "test-resource=resource-1",
           "value": "resource-1",
         },
       ]
      `);
    });

    it('should produce diff of a resource associated with a shared resource using the overridden diff()', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const resource1 = new TestResourceWithDiffOverride('resource-1');
      resourceDataRepository.add(resource1);
      await createTestResources({}, { 'shared-resource-1': [resource1] });

      const diffOverrideSpy = jest.spyOn(resource1, 'diff');
      await resourceDataRepository.diff();

      expect(diffOverrideSpy).toHaveBeenCalledTimes(1);
      expect(diffOverrideSpy.mock.calls[0]).toHaveLength(1);
      expect((diffOverrideSpy.mock.calls[0] as any)[0].resourceId).toBe('shared-resource-1');
    });

    it('should produce a delete diff', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });

      await commitResources();

      resourceDataRepository.remove(resource1);

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "resourceId",
           "model": "test-resource=resource-1",
           "value": "resource-1",
         },
       ]
      `);
    });

    it('should produce a delete diff when resource is removed', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });

      await commitResources();

      resource1.remove();

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "resourceId",
           "model": "test-resource=resource-1",
           "value": "resource-1",
         },
       ]
      `);
    });

    it('should produce an update diff using overridden resource diff()', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const resource1 = new TestResourceWithDiffOverride('resource-1');
      resourceDataRepository.add(resource1);

      await commitResources();

      const diffOverrideSpy = jest.spyOn(resource1, 'diff');
      await resourceDataRepository.diff();

      expect(diffOverrideSpy).toHaveBeenCalledTimes(1);
      expect(diffOverrideSpy.mock.calls[0]).toHaveLength(1);
      expect((diffOverrideSpy.mock.calls[0] as any)[0].resourceId).toBe('resource-1');
    });

    it('should not produce an update diff if no changes found', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      await createTestResources({ 'resource-1': [] });

      await commitResources();

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`[]`);
    });

    it('should produce an update diff of flat properties', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = 'value1';
      resource1.properties['key2'] = 'value2';

      await commitResources();

      // Update resource properties.
      resource1.properties['key2'] = 'value2.1';
      resource1.properties['key3'] = 'value3';

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
           "model": "test-resource=resource-1",
           "value": {
             "key": "key2",
             "value": "value2.1",
           },
         },
         {
           "action": "add",
           "field": "properties",
           "model": "test-resource=resource-1",
           "value": {
             "key": "key3",
             "value": "value3",
           },
         },
       ]
      `);
    });

    it('should produce an update diff of nested properties', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = { 'key1.1': 'value1.1' };
      resource1.properties['key2'] = { 'key2.1': 'value2.1' };

      await commitResources();

      // Update resource properties.
      resource1.properties['key1'] = { 'key1.1': 'value1.3', 'key1.2': 'value1.2' };
      resource1.properties['key2'] = { 'key2.1': 'value2.1' };

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
           "model": "test-resource=resource-1",
           "value": {
             "key": "key1",
             "value": {
               "key1.1": "value1.3",
               "key1.2": "value1.2",
             },
           },
         },
       ]
      `);
    });

    it('should produce an update diff of array properties', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = ['value1.1', 'value1.2'];

      await commitResources();

      // Update resource properties.
      resource1.properties['key1'] = ['value1.3', 'value1.4'];

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
           "model": "test-resource=resource-1",
           "value": {
             "key": "key1",
             "value": [
               "value1.3",
               "value1.4",
             ],
           },
         },
       ]
      `);
    });

    it('should produce an add parent diffs on parent add', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [parentResource1, resource1] = await createTestResources({ 'parent-resource-1': [], 'resource-1': [] });

      await commitResources();

      // Update resource parents.
      parentResource1.addChild('resourceId', resource1, 'resourceId');

      const diffs = await resourceDataRepository.diff();
      expect(diffs.map((d) => ({ action: d.action, field: d.field }))).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "parent",
         },
       ]
      `);
    });

    it('should produce a delete parent diffs on parent delete', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [parentResource1, resource1] = await createTestResources({
        'parent-resource-1': [],
        'resource-1': ['parent-resource-1'],
      });

      await commitResources();

      // Update resource parents.
      parentResource1.removeRelationship(resource1);

      const diffs = await resourceDataRepository.diff();
      expect(diffs.map((d) => ({ action: d.action, field: d.field }))).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "parent",
         },
       ]
      `);
    });
  });

  describe('remove()', () => {
    it('should not be able to remove a resource with dependencies', async () => {
      const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      expect(() => {
        resource1.remove();
      }).toThrowErrorMatchingInlineSnapshot(`"Cannot remove model until dependent models exist!"`);
    });

    it('should be able to remove leaf resources', async () => {
      const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      resource2.remove();

      expect(resource1.getChildren()).toMatchInlineSnapshot(`{}`);
      expect(resource2.isMarkedDeleted()).toBe(true);
    });
  });

  describe('synth()', () => {
    it('should be able to synth a resource', async () => {
      const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });
      resource1.properties['key1'] = 'value1';
      resource2.properties['key1'] = 'value1';

      expect(resource2.synth()).toMatchInlineSnapshot(`
       {
         "properties": {
           "key1": "value1",
         },
         "resourceId": "resource-2",
         "response": {},
       }
      `);
    });
  });

  describe('unSynth()', () => {
    it('should be able to unSynth a resource with parents', async () => {
      const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });
      resource1.properties['key1'] = 'value1';
      resource2.properties['key2'] = 'value2';

      const deReferenceResource = async (resourceId: string): Promise<TestResource> => {
        return new TestResource(resourceId);
      };

      const resource2_1 = await AResource.unSynth(TestResource, resource2.synth(), ['resource-1'], deReferenceResource);

      expect(resource2_1.getParents()['test-resource']).toHaveLength(1);
    });
  });
});
