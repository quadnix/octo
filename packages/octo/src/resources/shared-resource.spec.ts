import { SharedTestResource, TestResource } from '../../test/helpers/test-classes.js';
import { Container } from '../decorators/container.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { ResourceDataRepository } from './resource-data.repository.js';

describe('SharedResource UT', () => {
  let resourceSerializationService: ResourceSerializationService;

  beforeAll(async () => {
    resourceSerializationService = await Container.get(ResourceSerializationService);
    resourceSerializationService.registerClass(TestResource.name, TestResource);
    resourceSerializationService.registerClass(SharedTestResource.name, SharedTestResource);
  });

  afterAll(() => {
    Container.reset();
  });

  describe('diff()', () => {
    it('should not diff shared resource', async () => {
      const resource1 = new TestResource('resource-1');
      const sharedResource1 = new SharedTestResource('shared-resource-1', {}, [resource1]);

      const diffs = await sharedResource1.diff();

      expect(diffs).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('getSharedResource()', () => {
    it('should not return shared resource', async () => {
      const resource1 = new TestResource('resource-1');
      const sharedResource1 = new SharedTestResource('shared-resource-1', {}, [resource1]);

      // Calling getSharedResource() on a shared resource should return undefined.
      expect(sharedResource1.getSharedResource()).toBeUndefined();
    });
  });

  describe('merge()', () => {
    it('should merge previous shared resource with self and return new shared resource', () => {
      const resource1 = new TestResource('resource-1');
      const resource2 = new TestResource('resource-2');

      const sharedResource1_1 = new SharedTestResource('shared-resource-1', {}, [resource1]);
      sharedResource1_1.properties['property-1'] = 'property-value-1';
      sharedResource1_1.properties['property-2'] = 'property-value-3';
      sharedResource1_1.response['response-1'] = 'response-value-1';

      const sharedResource1 = new SharedTestResource('shared-resource-1', {}, [resource2]);
      sharedResource1.properties['property-2'] = 'property-value-2';
      sharedResource1.response['response-2'] = 'response-value-2';

      expect(sharedResource1.getDependencies().length).toBe(1);

      sharedResource1.merge(sharedResource1_1);

      expect(sharedResource1.getDependencies().length).toBe(2);
      expect(sharedResource1.properties).toMatchInlineSnapshot(`
        {
          "property-1": "property-value-1",
          "property-2": "property-value-2",
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
      const resource1 = new TestResource('resource-1');
      const sharedResource1 = new SharedTestResource('shared-resource-1', {}, [resource1]);

      const resources = [resource1, sharedResource1];
      await Container.get(ResourceDataRepository, { args: [true, [], [...resources]] });

      const currentSerializedOutput = await resourceSerializationService.serialize();
      await resourceSerializationService.deserialize(currentSerializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository['oldResources'];

      await Container.get(ResourceDataRepository, {
        args: [true, [...deserializedResources], [...deserializedResources]],
      });
      const previousSerializedOutput = await resourceSerializationService.serialize();
      expect(previousSerializedOutput).toEqual(currentSerializedOutput);
    });

    it('should serialize and deserialize shared-resources with parent', async () => {
      const parentResource = new TestResource('parent-1');
      const testResource = new TestResource('resource-1', { property1: 'property-value-1' }, [parentResource]);
      testResource.response['response1'] = 'response-value-1';
      const sharedTestResource = new SharedTestResource('shared-test-resource', {}, [testResource]);

      const resources = [parentResource, testResource, sharedTestResource];
      await Container.get(ResourceDataRepository, { args: [true, [], [...resources]] });

      const currentSerializedOutput = await resourceSerializationService.serialize();
      await resourceSerializationService.deserialize(currentSerializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository['oldResources'];

      await Container.get(ResourceDataRepository, {
        args: [true, [...deserializedResources], [...deserializedResources]],
      });
      const previousSerializedOutput = await resourceSerializationService.serialize();
      expect(previousSerializedOutput).toEqual(currentSerializedOutput);
    });

    it('should serialize and deserialize shared-resources with different parents', async () => {
      // "resource-1" is a shared-resource(S1) parented by "parent-1".
      const parentResource1 = new TestResource('parent-1');
      const testResource1 = new TestResource('resource-1', { property1: 'property-value-1' }, [parentResource1]);
      // "resource-2" is also a shared-resource(S1), but parented by "parent-2".
      const parentResource2 = new TestResource('parent-2');
      const testResource2 = new TestResource('resource-2', { property2: 'property-value-2' }, [parentResource2]);
      const sharedTestResource = new SharedTestResource('shared-test-resource', {}, [testResource1, testResource2]);

      const resources = [parentResource1, parentResource2, testResource1, testResource2, sharedTestResource];
      await Container.get(ResourceDataRepository, { args: [true, [], [...resources]] });

      const currentSerializedOutput = await resourceSerializationService.serialize();
      await resourceSerializationService.deserialize(currentSerializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository['oldResources'];

      await Container.get(ResourceDataRepository, {
        args: [true, [...deserializedResources], [...deserializedResources]],
      });
      const previousSerializedOutput = await resourceSerializationService.serialize();
      expect(previousSerializedOutput).toEqual(currentSerializedOutput);
    });
  });
});
