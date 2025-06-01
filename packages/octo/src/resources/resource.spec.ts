import { jest } from '@jest/globals';
import { MatchingResource, type UnknownResource } from '../app.type.js';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { Dependency } from '../functions/dependency/dependency.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { TestResource } from '../utilities/test-helpers/test-classes.js';
import { createTestResources } from '../utilities/test-helpers/test-resources.js';
import { ResourceDataRepository } from './resource-data.repository.js';
import { AResource } from './resource.abstract.js';

describe('Resource UT', () => {
  let container: Container;
  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
  });

  afterEach(async () => {
    await TestContainer.reset();

    jest.restoreAllMocks();
  });

  it('should add parent', async () => {
    const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
      await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
      ]);

    expect(resource1.getDependencies().length).toBe(1);
    expect(resource2.getDependencies().length).toBe(1);
  });

  it('should skip adding the same parent twice', async () => {
    const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
      await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        {
          parents: ['@octo/test-resource=resource-1', '@octo/test-resource=resource-1'],
          resourceContext: '@octo/test-resource=resource-2',
        },
      ]);

    expect(resource1.getDependencies().length).toBe(1);
    expect(resource2.getDependencies().length).toBe(1);
  });

  describe('addChild()', () => {
    it('should add resource parent to the parents list', async () => {
      const resource1 = new TestResource('resource-1', {}, []);
      const resource2 = new TestResource('resource-2', {}, []);

      resource1.addChild('resourceId', resource2, 'resourceId');

      expect(resource1.parents.length).toBe(0);
      expect(resource2.parents.length).toBe(1);
    });

    it('should skip adding resource parent to the parents list that already exists', async () => {
      const resource1 = new TestResource('resource-1', {}, []);
      const resource2 = new TestResource('resource-2', {}, []);

      resource1.addChild('resourceId', resource2, 'resourceId');
      resource1.addChild('resourceId', resource2, 'resourceId');

      expect(resource1.parents.length).toBe(0);
      expect(resource2.parents.length).toBe(1);
    });

    it('should add matching resource parent to the parents list', async () => {
      const resource1 = new MatchingResource(new TestResource('resource-1', {}, []));
      const resource2 = new MatchingResource(new TestResource('resource-2', {}, []));

      resource1.addChild('resourceId', resource2.getActual(), 'resourceId');

      expect(resource1.getActual().parents.length).toBe(0);
      expect(resource2.getActual().parents.length).toBe(1);
    });

    it('should skip adding matching resource parent to the parents list that already exists', async () => {
      const resource1 = new MatchingResource(new TestResource('resource-1', {}, []));
      const resource2 = new MatchingResource(new TestResource('resource-2', {}, []));

      resource1.addChild('resourceId', resource2.getActual(), 'resourceId');
      resource1.addChild('resourceId', resource2.getActual(), 'resourceId');

      expect(resource1.getActual().parents.length).toBe(0);
      expect(resource2.getActual().parents.length).toBe(1);
    });
  });

  describe('cloneResource()', () => {
    it('should clone a resource', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      await createTestResources([{ resourceContext: '@octo/test-resource=resource-1' }], { save: true });

      const { '@octo/test-resource=resource-2': resource2 } = await createTestResources(
        [
          {
            parents: ['@octo/test-resource=resource-1'],
            properties: { key1: 'value1' },
            resourceContext: '@octo/test-resource=resource-2',
            response: { key1: 'value1' },
          },
        ],
        { save: false },
      );

      const deReferenceResource = async (context: string): Promise<UnknownResource> => {
        return resourceDataRepository.getActualResourceByContext(context)!;
      };

      // Clone resource from "new" to "actual", as done in transaction-service.
      const resource2Copy = await AResource.cloneResource(resource2, deReferenceResource);

      expect(resource2Copy.synth()).toMatchInlineSnapshot(`
       {
         "parents": [
           {
             "context": "@octo/test-resource=resource-1",
           },
         ],
         "properties": {
           "key1": "value1",
         },
         "resourceId": "resource-2",
         "response": {
           "key1": "value1",
         },
       }
      `);
      expect(resource2Copy.getParents()['test-resource'].length).toBe(1);
    });
  });

  describe('cloneResourceInPlace()', () => {
    it('should clone an empty resource in place', async () => {
      const {
        '@octo/test-resource=resource-1': resource1,
        '@octo/test-resource=resource-2': resource2,
        '@octo/test-resource=resource-3': resource3,
      } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        {
          parents: ['@octo/test-resource=resource-1'],
          properties: { key1: 'value1' },
          resourceContext: '@octo/test-resource=resource-2',
          response: { key1: 'value1' },
        },
        { resourceContext: '@octo/test-resource=resource-3' },
      ]);

      await resource3.cloneResourceInPlace(resource2, async (context: string) => {
        if (context === '@octo/test-resource=resource-1') {
          return resource1;
        } else if (context === '@octo/test-resource=resource-2') {
          return resource2;
        }
        throw new Error('Unknown resource!');
      });

      expect(resource3.synth()).toMatchInlineSnapshot(`
       {
         "parents": [
           {
             "context": "@octo/test-resource=resource-1",
           },
         ],
         "properties": {
           "key1": "value1",
         },
         "resourceId": "resource-3",
         "response": {
           "key1": "value1",
         },
       }
      `);
      expect(resource3.getParents()['test-resource'].length).toBe(1);
    });

    it('should clone an existing resource in place', async () => {
      const {
        '@octo/test-resource=resource-1': resource1,
        '@octo/test-resource=resource-2': resource2,
        '@octo/test-resource=resource-4': resource4,
      } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        {
          parents: ['@octo/test-resource=resource-1'],
          properties: { key1: 'value1' },
          resourceContext: '@octo/test-resource=resource-2',
          response: { key1: 'value1' },
        },
        { resourceContext: '@octo/test-resource=resource-3' },
        {
          parents: ['@octo/test-resource=resource-3'],
          properties: { key1: 'value1' },
          resourceContext: '@octo/test-resource=resource-4',
          response: { key1: 'value1' },
        },
      ]);

      await resource4.cloneResourceInPlace(resource2, async (context: string) => {
        if (context === '@octo/test-resource=resource-1') {
          return resource1;
        } else if (context === '@octo/test-resource=resource-2') {
          return resource2;
        }
        throw new Error('Unknown resource!');
      });

      expect(resource4.synth()).toMatchInlineSnapshot(`
       {
         "parents": [
           {
             "context": "@octo/test-resource=resource-1",
           },
         ],
         "properties": {
           "key1": "value1",
         },
         "resourceId": "resource-4",
         "response": {
           "key1": "value1",
         },
       }
      `);
      expect(resource4.getParents()['test-resource'].length).toBe(1);
      expect((resource4.getParents()['test-resource'][0].to as UnknownResource).resourceId).toBe('resource-1');
    });

    it('should clone an existing resource in place and replace properties and response', async () => {
      const {
        '@octo/test-resource=resource-1': resource1,
        '@octo/test-resource=resource-2': resource2,
        '@octo/test-resource=resource-4': resource4,
      } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        {
          parents: ['@octo/test-resource=resource-1'],
          properties: { key1: 'value1' },
          resourceContext: '@octo/test-resource=resource-2',
          response: { key1: 'value1' },
        },
        { resourceContext: '@octo/test-resource=resource-3' },
        {
          parents: ['@octo/test-resource=resource-3'],
          properties: { key2: 'value1' },
          resourceContext: '@octo/test-resource=resource-4',
          response: { key2: 'value1' },
        },
      ]);

      await resource4.cloneResourceInPlace(resource2, async (context: string) => {
        if (context === '@octo/test-resource=resource-1') {
          return resource1;
        } else if (context === '@octo/test-resource=resource-2') {
          return resource2;
        }
        throw new Error('Unknown resource!');
      });

      expect(resource4.synth()).toMatchInlineSnapshot(`
       {
         "parents": [
           {
             "context": "@octo/test-resource=resource-1",
           },
         ],
         "properties": {
           "key1": "value1",
         },
         "resourceId": "resource-4",
         "response": {
           "key1": "value1",
         },
       }
      `);
      expect(resource4.getParents()['test-resource'].length).toBe(1);
      expect((resource4.getParents()['test-resource'][0].to as UnknownResource).resourceId).toBe('resource-1');
    });
  });

  describe('diff()', () => {
    it('should not produce an update diff if no changes found', async () => {
      const resource1 = new TestResource('resource-1', {}, []);
      const resource2 = new TestResource('resource-2', {}, [resource1]);

      const diffs = await resource2.diff(resource2);

      expect(diffs).toMatchInlineSnapshot(`[]`);
    });

    it('should produce an update diff of flat properties', async () => {
      const resource1 = new TestResource('resource-1', {}, []);
      resource1.properties['key1'] = 'value1';
      resource1.properties['key2'] = 'value2';

      const resource1New = new TestResource('resource-1', {}, []);
      resource1New.properties['key2'] = 'value2.1';
      resource1New.properties['key3'] = 'value3';

      const diffs = await resource1New.diff(resource1);
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "properties",
           "node": "@octo/test-resource=resource-1",
           "value": {
             "key": "key1",
             "value": "value1",
           },
         },
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/test-resource=resource-1",
           "value": {
             "key": "key2",
             "value": "value2.1",
           },
         },
         {
           "action": "add",
           "field": "properties",
           "node": "@octo/test-resource=resource-1",
           "value": {
             "key": "key3",
             "value": "value3",
           },
         },
       ]
      `);
    });

    it('should produce an update diff of nested properties', async () => {
      const resource1 = new TestResource('resource-1', {}, []);
      resource1.properties['key1'] = { 'key1.1': 'value1.1' };
      resource1.properties['key2'] = { 'key2.1': 'value2.1' };

      const resource1New = new TestResource('resource-1', {}, []);
      resource1New.properties['key1'] = { 'key1.1': 'value1.3', 'key1.2': 'value1.2' };
      resource1New.properties['key2'] = { 'key2.1': 'value2.1' };

      const diffs = await resource1New.diff(resource1);
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/test-resource=resource-1",
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
      const resource1 = new TestResource('resource-1', {}, []);
      resource1.properties['key1'] = ['value1.1', 'value1.2'];

      const resource1New = new TestResource('resource-1', {}, []);
      resource1New.properties['key1'] = ['value1.3', 'value1.4'];

      const diffs = await resource1New.diff(resource1);
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/test-resource=resource-1",
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
      const resource1 = new TestResource('resource-1', {}, []);

      const parentResource1New = new TestResource('parent-resource-1', {}, []);
      const resource1New = new TestResource('resource-1', {}, [parentResource1New]);

      const diffs = await resource1New.diff(resource1);
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
      const parentResource1 = new TestResource('parent-resource-1', {}, []);
      const resource1 = new TestResource('resource-1', {}, [parentResource1]);

      const resource1New = new TestResource('resource-1', {}, []);

      const diffs = await resource1New.diff(resource1);
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

  describe('diffInverse()', () => {
    it('should throw error when diff field is unknown', async () => {
      const resource1 = new TestResource('resource-1', {}, []);
      const diff = new Diff(resource1, DiffAction.ADD, 'field', 'value');

      await expect(async () => {
        await resource1.diffInverse(diff, async () => resource1);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Unknown field during diff inverse!"`);
    });

    describe('when diff field is resourceId', () => {
      it('should call remove() when action is DELETE', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        const diff = new Diff(resource1, DiffAction.DELETE, 'resourceId', 'value');

        jest.spyOn(resource1, 'remove').mockImplementation(() => {});

        await resource1.diffInverse(diff, async () => resource1);
        expect(resource1.remove).toHaveBeenCalledTimes(1);
      });

      it('should throw error when action is not DELETE', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        const diff = new Diff(resource1, DiffAction.ADD, 'resourceId', 'value');

        await expect(async () => {
          await resource1.diffInverse(diff, async () => resource1);
        }).rejects.toThrowErrorMatchingInlineSnapshot(`"Unknown action on "resourceId" field during diff inverse!"`);
      });
    });

    describe('when diff field is parent', () => {
      it('should call cloneResourceInPlace() when action is ADD', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        const diff = new Diff(resource1, DiffAction.ADD, 'parent', 'value');

        jest.spyOn(resource1, 'cloneResourceInPlace').mockImplementation(async () => {});

        await resource1.diffInverse(diff, async () => resource1);
        expect(resource1.cloneResourceInPlace).toHaveBeenCalledTimes(1);
      });

      it('should call cloneResourceInPlace() when action is DELETE', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        const diff = new Diff(resource1, DiffAction.DELETE, 'parent', 'value');

        jest.spyOn(resource1, 'cloneResourceInPlace').mockImplementation(async () => {});

        await resource1.diffInverse(diff, async () => resource1);
        expect(resource1.cloneResourceInPlace).toHaveBeenCalledTimes(1);
      });

      it('should throw error when action is not ADD or DELETE or UPDATE', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        const diff = new Diff(resource1, DiffAction.REPLACE, 'parent', 'value');

        await expect(async () => {
          await resource1.diffInverse(diff, async () => resource1);
        }).rejects.toThrowErrorMatchingInlineSnapshot(`"Unknown action on "parent" field during diff inverse!"`);
      });
    });

    describe('when diff field is properties', () => {
      it('should add property when action is ADD', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        const diff = new Diff(resource1, DiffAction.ADD, 'properties', { key: 'key1', value: 'value1' });

        await resource1.diffInverse(diff, async () => resource1);

        expect(resource1.properties).toMatchInlineSnapshot(`
         {
           "key1": "value1",
         }
        `);
      });

      it('should update property when action is UPDATE', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        resource1.properties.key1 = 'value';
        const diff = new Diff(resource1, DiffAction.UPDATE, 'properties', { key: 'key1', value: 'value1' });

        await resource1.diffInverse(diff, async () => resource1);

        expect(resource1.properties).toMatchInlineSnapshot(`
         {
           "key1": "value1",
         }
        `);
      });

      it('should delete property when action is DELETE', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        resource1.properties.key1 = 'value';
        const diff = new Diff(resource1, DiffAction.DELETE, 'properties', { key: 'key1' });

        await resource1.diffInverse(diff, async () => resource1);

        expect(resource1.properties).toMatchInlineSnapshot(`{}`);
      });

      it('should throw error when action is not ADD, UPDATE, or DELETE', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        const diff = new Diff(resource1, DiffAction.REPLACE, 'properties', '');

        await expect(async () => {
          await resource1.diffInverse(diff, async () => resource1);
        }).rejects.toThrowErrorMatchingInlineSnapshot(`"Unknown action on "properties" field during diff inverse!"`);
      });

      it('should replace response', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        resource1.response.key1 = 'value1';
        const diff = new Diff(resource1, DiffAction.ADD, 'properties', { key: 'key1', value: 'value1' });

        const resource2 = new TestResource('resource-2', {}, []);
        resource2.response.key2 = 'value2';
        await resource2.diffInverse(diff, async () => resource1);

        expect(resource2.response).toMatchInlineSnapshot(`
         {
           "key1": "value1",
         }
        `);
      });
    });
  });

  describe('findParentsByProperty()', () => {
    it('should return empty array when filters do not match', async () => {
      const { '@octo/test-resource=resource-2': resource2 } = await createTestResources([
        { properties: { key1: 'value1' }, resourceContext: '@octo/test-resource=resource-1' },
        {
          parents: ['@octo/test-resource=resource-1'],
          resourceContext: '@octo/test-resource=resource-2',
        },
      ]);

      const parents = resource2.findParentsByProperty([{ key: 'key1', value: 'value2' }]);

      expect(parents).toEqual([]);
    });

    it('should return matching parents in array when filters match', async () => {
      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          { properties: { key1: 'value1' }, resourceContext: '@octo/test-resource=resource-1' },
          {
            parents: ['@octo/test-resource=resource-1'],
            resourceContext: '@octo/test-resource=resource-2',
          },
        ]);

      const parents = resource2.findParentsByProperty([{ key: 'key1', value: 'value1' }]);

      expect(parents.length).toBe(1);
      expect(parents[0]).toBe(resource1);
    });
  });

  describe('getAncestors()', () => {
    it('should return self where there are no ancestors', async () => {
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);

      const ancestors = resource1.getAncestors();

      expect(ancestors.map((r: UnknownResource) => r.resourceId)).toMatchInlineSnapshot(`
       [
         "resource-1",
       ]
      `);
    });

    it('should return self and ancestors where there are ancestors', async () => {
      const { '@octo/test-resource=resource-2': resource2 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        {
          parents: ['@octo/test-resource=resource-1'],
          resourceContext: '@octo/test-resource=resource-2',
        },
      ]);

      const ancestors = resource2.getAncestors();

      expect(ancestors.map((r: UnknownResource) => r.resourceId)).toMatchInlineSnapshot(`
       [
         "resource-2",
         "resource-1",
       ]
      `);
    });
  });

  describe('hasAncestor()', () => {
    it('should return false when resource is not an ancestor', async () => {
      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          {
            resourceContext: '@octo/test-resource=resource-2',
          },
        ]);

      const isAncestor = resource2.hasAncestor(resource1);

      expect(isAncestor).toBe(false);
    });

    it('should return true when resource is an ancestor', async () => {
      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          {
            parents: ['@octo/test-resource=resource-1'],
            resourceContext: '@octo/test-resource=resource-2',
          },
        ]);

      const isAncestor = resource2.hasAncestor(resource1);

      expect(isAncestor).toBe(true);
    });

    it('should return true when resource is checked against itself', async () => {
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);

      const isAncestor = resource1.hasAncestor(resource1);

      expect(isAncestor).toBe(true);
    });
  });

  describe('isDeepEquals()', () => {
    it('should return false when no other resource', async () => {
      const resource1 = new TestResource('resource-1', {}, []);

      const result = resource1.isDeepEquals();

      expect(result).toBe(false);
    });

    it('should return false when other resource is not the same resource', async () => {
      const resource1 = new TestResource('resource-1', {}, []);
      resource1.properties.key1 = 'value1';
      const resource1New = new TestResource('resource-1', {}, []);

      const result = resource1.isDeepEquals(resource1New);

      expect(result).toBe(false);
    });

    it('should return false when the other resource differs in deletion', async () => {
      const resource1 = new TestResource('resource-1', {}, []);
      resource1.remove();
      const resource1New = new TestResource('resource-1', {}, []);

      const result = resource1.isDeepEquals(resource1New);

      expect(result).toBe(false);
    });

    it('should return false when the other resource has different parents', async () => {
      const resource1 = new TestResource('resource-1', {}, []);
      const resource2 = new TestResource('resource-2', {}, [resource1]);
      const resource2New = new TestResource('resource-2', {}, []);

      const result = resource2.isDeepEquals(resource2New);

      expect(result).toBe(false);
    });

    it('should return true when the other resource is same including parents', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const { '@octo/test-resource=resource-2': resource2 } = await createTestResources(
        [
          { resourceContext: '@octo/test-resource=resource-1' },
          {
            parents: ['@octo/test-resource=resource-1'],
            properties: { key1: 'value1' },
            resourceContext: '@octo/test-resource=resource-2',
            response: { key1: 'value1' },
          },
        ],
        { save: true },
      );

      // Compare new and actual resources.
      const resource2Actual = resourceDataRepository.getActualResourceByContext('@octo/test-resource=resource-2')!;

      const result = resource2.isDeepEquals(resource2Actual);

      expect(result).toBe(true);
    });
  });

  describe('merge()', () => {
    it('should merge previous resource with self and return previous resource', async () => {
      const { '@octo/test-resource=resource-2': previousResource } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        {
          parents: ['@octo/test-resource=resource-1'],
          properties: { 'property-1': 'property-value-1', 'property-2': 'property-value-3' },
          resourceContext: '@octo/test-resource=resource-2',
          response: { 'response-1': 'response-value-1' },
        },
      ]);

      const currentResource = new TestResource('resource-2', { 'property-2': 'property-value-2' }, []);
      currentResource.response['response-2'] = 'response-value-2';

      expect(currentResource.getDependencies()).toHaveLength(0);
      currentResource.merge(previousResource);
      expect(currentResource.getDependencies()).toHaveLength(1);
      expect(currentResource.properties).toMatchInlineSnapshot(`
        {
          "property-1": "property-value-1",
          "property-2": "property-value-2",
        }
      `);
      expect(currentResource.response).toMatchInlineSnapshot(`
        {
          "response-1": "response-value-1",
          "response-2": "response-value-2",
        }
      `);
    });

    it('should reference previous resource when self merged with previous', async () => {
      const { '@octo/test-resource=resource-2': previousResource } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        {
          parents: ['@octo/test-resource=resource-1'],
          properties: { 'property-1': 'property-value-1', 'property-2': 'property-value-3' },
          resourceContext: '@octo/test-resource=resource-2',
          response: { 'response-1': 'response-value-1' },
        },
      ]);

      const currentResource = new TestResource('resource-2', { 'property-2': 'property-value-2' }, []);
      currentResource.response['response-2'] = 'response-value-2';

      currentResource.merge(previousResource);
      expect(previousResource.properties).toMatchInlineSnapshot(`
        {
          "property-1": "property-value-1",
          "property-2": "property-value-2",
        }
      `);
      expect(previousResource.response).toMatchInlineSnapshot(`
        {
          "response-1": "response-value-1",
          "response-2": "response-value-2",
        }
      `);

      // Update current resource, which should reference previous resource.
      currentResource.properties['property-2'] = 'property-value-3';
      currentResource.response['response-2'] = 'response-value-3';

      expect(previousResource.properties).toMatchInlineSnapshot(`
        {
          "property-1": "property-value-1",
          "property-2": "property-value-3",
        }
      `);
      expect(previousResource.response).toMatchInlineSnapshot(`
        {
          "response-1": "response-value-1",
          "response-2": "response-value-3",
        }
      `);
    });

    it("should update current resource's resourceId when merged with previous", async () => {
      const { '@octo/test-resource=resource-1': previousResource, '@octo/test-resource=resource-2': currentResource } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          { resourceContext: '@octo/test-resource=resource-2' },
        ]);

      expect(currentResource.resourceId).toBe('resource-2');
      currentResource.merge(previousResource);
      expect(currentResource.resourceId).toBe('resource-1');
    });

    it('should copy parents of current resource to previous resource', async () => {
      const { '@octo/test-resource=resource-2': previousResource, '@octo/test-resource=resource-3': currentResource } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          { resourceContext: '@octo/test-resource=resource-2' },
          {
            parents: ['@octo/test-resource=resource-1'],
            resourceContext: '@octo/test-resource=resource-3',
          },
        ]);

      expect(previousResource.getDependencies()).toHaveLength(0);
      currentResource.merge(previousResource);
      expect(previousResource.getDependencies()).toHaveLength(1);
    });

    it('should copy children of current resource to previous resource', async () => {
      const { '@octo/test-resource=resource-1': currentResource, '@octo/test-resource=resource-3': previousResource } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
          { resourceContext: '@octo/test-resource=resource-3' },
        ]);

      expect(previousResource.getDependencies()).toHaveLength(0);
      currentResource.merge(previousResource);
      expect(previousResource.getDependencies()).toHaveLength(1);
    });

    it('should throw error when copying current resource dependencies that are neither parent nor child', async () => {
      const { '@octo/test-resource=resource-1': previousResource, '@octo/test-resource=resource-2': currentResource } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          { resourceContext: '@octo/test-resource=resource-2' },
        ]);

      currentResource['dependencies'].push(new Dependency(currentResource, currentResource));
      expect(() => {
        currentResource.merge(previousResource);
      }).toThrowErrorMatchingInlineSnapshot(`"Unknown dependency found in merge!"`);
    });
  });

  describe('remove()', () => {
    it('should not be able to remove a resource with dependencies', async () => {
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        {
          properties: { key1: 'value1' },
          resourceContext: '@octo/test-resource=resource-1',
          response: { response1: 'value1' },
        },
        {
          parents: ['@octo/test-resource=resource-1'],
          properties: { key2: 'value2' },
          resourceContext: '@octo/test-resource=resource-2',
          response: { response2: 'value2' },
        },
      ]);

      expect(() => {
        resource1.remove();
      }).toThrowErrorMatchingInlineSnapshot(`"Cannot remove resource until dependent nodes exist!"`);
    });

    it('should be able to remove leaf resources', async () => {
      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          {
            properties: { key1: 'value1' },
            resourceContext: '@octo/test-resource=resource-1',
            response: { response1: 'value1' },
          },
          {
            parents: ['@octo/test-resource=resource-1'],
            properties: { key2: 'value2' },
            resourceContext: '@octo/test-resource=resource-2',
            response: { response2: 'value2' },
          },
        ]);

      resource2.remove();

      expect(resource1.getChildren()).toMatchInlineSnapshot(`{}`);
      expect(resource2.isMarkedDeleted()).toBe(true);
    });
  });

  describe('setContext()', () => {
    it('should be able to get context', async () => {
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);

      expect(resource1.getContext()).toMatchInlineSnapshot(`"@octo/test-resource=resource-1"`);
    });
  });

  describe('synth()', () => {
    it('should be able to synth a resource', async () => {
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        {
          properties: { key1: 'value1' },
          resourceContext: '@octo/test-resource=resource-1',
          response: { key1: 'value1' },
        },
      ]);

      expect(resource1.synth()).toMatchInlineSnapshot(`
       {
         "parents": [],
         "properties": {
           "key1": "value1",
         },
         "resourceId": "resource-1",
         "response": {
           "key1": "value1",
         },
       }
      `);
    });
  });

  describe('unSynth()', () => {
    it('should be able to unSynth a resource with parents', async () => {
      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          {
            properties: { key1: 'value1' },
            resourceContext: '@octo/test-resource=resource-1',
          },
          {
            parents: ['@octo/test-resource=resource-1'],
            properties: { key2: 'value2' },
            resourceContext: '@octo/test-resource=resource-2',
          },
        ]);

      const resource2_1: UnknownResource = await AResource.unSynth(
        TestResource,
        resource2.synth(),
        async () => resource1,
      );

      expect(resource2_1.getParents()['test-resource']).toHaveLength(1);
    });
  });
});
