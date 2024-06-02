import { jest } from '@jest/globals';
import { SharedTestResource, TestResource, TestResourceWithDiffOverride } from '../../test/helpers/test-classes.js';
import { ResourceDataRepository } from './resource-data.repository.js';
import { AResource } from './resource.abstract.js';

describe('Resource UT', () => {
  it('should be able to associate with another resource as its child', () => {
    const resource1 = new TestResource('resource-1');
    const resource2 = new TestResource('resource-2', {}, [resource1]);

    expect((resource1.getChildren()['test-resource'][0].to as AResource<TestResource>).resourceId).toBe('resource-2');
    expect((resource2.getParents()['test-resource'][0].to as AResource<TestResource>).resourceId).toBe('resource-1');
  });

  it('should be able to associate with another resource multiple times', () => {
    const resource1 = new TestResource('resource-1');
    const resource2 = new TestResource('resource-2', {}, [resource1, resource1]);

    expect(resource1.getChildren()['test-resource'].length).toBe(1);
    expect(resource2.getParents()['test-resource'].length).toBe(1);
  });

  describe('diff()', () => {
    it('should produce an add diff', async () => {
      const resourceDataRepository = new ResourceDataRepository([], []);

      const resource1 = new TestResource('resource-1');
      resourceDataRepository.add(resource1);

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
        [
          {
            "action": "add",
            "field": "resourceId",
            "value": "resource-1",
          },
        ]
      `);
    });

    it('should produce diff of a resource associated with a shared resource using the overridden diff()', async () => {
      const resourceDataRepository = new ResourceDataRepository([], []);

      const resource1 = new TestResourceWithDiffOverride('resource-1');
      resourceDataRepository.add(resource1);
      const sharedResource1 = new SharedTestResource('shared-resource-1', {}, [resource1]);
      resourceDataRepository.add(sharedResource1);

      const diffOverrideSpy = jest.spyOn(resource1, 'diff');
      await resourceDataRepository.diff();

      expect(diffOverrideSpy).toHaveBeenCalledTimes(1);
      expect(diffOverrideSpy.mock.calls[0].length).toBe(1);
      expect((diffOverrideSpy.mock.calls[0] as any)[0].resourceId).toBe('shared-resource-1');
    });

    it('should produce a delete diff', async () => {
      const resource1 = new TestResource('resource-1');

      const resourceDataRepository = new ResourceDataRepository([resource1], []);

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "resourceId",
           "value": "resource-1",
         },
       ]
      `);
    });

    it('should produce a delete diff when resource is marked as deleted', async () => {
      const resource1 = new TestResource('resource-1');

      const resourceDataRepository = new ResourceDataRepository([resource1], [resource1]);

      resource1.markDeleted();

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "resourceId",
           "value": "resource-1",
         },
       ]
      `);
    });

    it('should produce an update diff using overridden resource diff()', async () => {
      const resource1_0 = new TestResourceWithDiffOverride('resource-1');

      const resourceDataRepository = new ResourceDataRepository([resource1_0], []);

      const resource1_1 = new TestResourceWithDiffOverride('resource-1');
      resourceDataRepository.add(resource1_1);

      const diffOverrideSpy = jest.spyOn(resource1_1, 'diff');
      await resourceDataRepository.diff();

      expect(diffOverrideSpy).toHaveBeenCalledTimes(1);
      expect(diffOverrideSpy.mock.calls[0].length).toBe(1);
      expect((diffOverrideSpy.mock.calls[0] as any)[0].resourceId).toBe('resource-1');
    });

    it('should not produce an update diff if no changes found', async () => {
      const resource1_0 = new TestResource('resource-1');
      const resource1_1 = new TestResource('resource-1');

      const resourceDataRepository = new ResourceDataRepository([resource1_0], [resource1_1]);

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`[]`);
    });

    it('should produce an update diff of flat properties', async () => {
      const resource1_0 = new TestResource('resource-1', { key1: 'value1', key2: 'value2' });
      const resource1_1 = new TestResource('resource-1', { key1: 'value1', key2: 'value2.1', key3: 'value3' });

      const resourceDataRepository = new ResourceDataRepository([resource1_0], [resource1_1]);

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
           "value": {
             "key": "key2",
             "value": "value2.1",
           },
         },
         {
           "action": "add",
           "field": "properties",
           "value": {
             "key": "key3",
             "value": "value3",
           },
         },
       ]
      `);
    });

    it('should produce an update diff of nested properties', async () => {
      const resource1_0 = new TestResource('resource-1', {
        key1: { 'key1.1': 'value1.1' },
        key2: { 'key2.1': 'value2.1' },
      });
      const resource1_1 = new TestResource('resource-1', {
        key1: { 'key1.1': 'value1.3', 'key1.2': 'value1.2' },
        key2: { 'key2.1': 'value2.1' },
      });

      const resourceDataRepository = new ResourceDataRepository([resource1_0], [resource1_1]);

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
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
      const resource1_0 = new TestResource('resource-1', { key1: ['value1.1', 'value1.2'] });
      const resource1_1 = new TestResource('resource-1', { key1: ['value1.3', 'value1.4'] });

      const resourceDataRepository = new ResourceDataRepository([resource1_0], [resource1_1]);

      const diffs = await resourceDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
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
  });

  describe('markDeleted()', () => {
    it('should not be able to mark a resource deleted with dependencies', () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2', {}, [resource1]);
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      expect(() => {
        resource1.markDeleted();
      }).toThrowErrorMatchingInlineSnapshot(`"Cannot remove model until dependent models exist!"`);
    });

    it('should be able to mark leaf resources deleted', () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2', {}, [resource1]);
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      resource2.markDeleted();

      expect(resource1.getChildren()).toMatchInlineSnapshot(`{}`);
      expect(resource2.isMarkedDeleted()).toBe(true);
    });
  });

  describe('synth()', () => {
    it('should be able to synth a resource', () => {
      const resource1 = new TestResource('resource-1', { key1: 'value1' });
      const resource2 = new TestResource('resource-2', { key1: 'value1' }, [resource1]);

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
      const resource1 = new TestResource('resource-1', { key1: 'value1' });
      const resource2_0 = new TestResource('resource-2', { key1: 'value1' }, [resource1]);

      const deReferenceResource = async (resourceId: string): Promise<TestResource> => {
        return new TestResource(resourceId);
      };

      const resource2_1 = await AResource.unSynth(
        TestResource,
        resource2_0.synth(),
        ['resource-1'],
        deReferenceResource,
      );

      expect(resource2_1.getParents()['test-resource'].length).toBe(1);
    });
  });
});
