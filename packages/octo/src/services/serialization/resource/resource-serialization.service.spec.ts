import { UnknownResource } from '../../../app.type.js';
import { AResource } from '../../../resources/resource.abstract.js';
import { ASharedResource } from '../../../resources/shared-resource.abstract.js';
import { ResourceSerializationService } from './resource-serialization.service.js';

class TestResource extends AResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string, properties: { [k: string]: string } = {}, parents: [TestResource?] = []) {
    super(resourceId, properties, parents as AResource<TestResource>[]);
  }
}

class SharedTestResource extends ASharedResource<TestResource> {
  readonly MODEL_NAME: string = 'shared-test-resource';

  constructor(resourceId: string, properties: object, parents: [TestResource?]) {
    super(resourceId, {}, parents as AResource<TestResource>[]);
  }
}

describe('Resource Serialization Service UT', () => {
  describe('deserialize()', () => {
    it('should throw error when de-serializing an unknown class', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      const service = new ResourceSerializationService();

      await expect(async () => {
        const serializedOutput = service.serialize([resource1]);
        await service.deserialize(serializedOutput);
      }).rejects.toThrowError();
    });

    it('should deserialize a single resource', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);

      const serializedOutput = service.serialize([resource1]);
      const resources = await service.deserialize(serializedOutput);

      expect(resources).toMatchSnapshot();
    });

    it('should deserialize a resource with complex properties', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = { key2: { key3: 'value3' }, key4: 'value4' };
      resource1.response['response1'] = 'value1';

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);

      const serializedOutput = service.serialize([resource1]);
      const resources = await service.deserialize(serializedOutput);

      expect(resources).toMatchSnapshot();
    });

    it('should deserialize a single shared resource', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new SharedTestResource('resource-2', {}, [resource1]);

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);
      service.registerClass('SharedTestResource', SharedTestResource);

      const serializedOutput = service.serialize([resource1, resource2]);
      const resources = await service.deserialize(serializedOutput);

      expect(resources).toMatchSnapshot();
    });

    it('should throw error trying to deserialize a shared resource without corresponding resource', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new SharedTestResource('resource-2', {}, [resource1]);

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);
      service.registerClass('SharedTestResource', SharedTestResource);
      service.setResourceDeserializationTimeout(50);

      const serializedOutput = service.serialize([resource2]);
      serializedOutput.resources = {};

      await expect(async () => {
        await service.deserialize(serializedOutput);
      }).rejects.toMatchInlineSnapshot(`[Error: DeReferencing resource operation timed out!]`);
    });

    it('should deserialize dependencies', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2');
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource1.addChild('resourceId', resource2, 'resourceId');

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);

      const serializedOutput = service.serialize([resource1, resource2]);
      const resources = await service.deserialize(serializedOutput);

      const resource1Deserialized = resources['resource-1'];
      const resource2Deserialized = resource1Deserialized.getChildren()['test-resource'][0]
        .to as AResource<TestResource>;
      expect(resource2Deserialized.resourceId).toBe('resource-2');
      expect((resource2Deserialized.getParents()['test-resource'][0].to as AResource<TestResource>).resourceId).toBe(
        'resource-1',
      );
    });

    it('should deserialize dependencies in reverse order', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2');
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource1.addChild('resourceId', resource2, 'resourceId');

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);

      // Reverse the list of resources, such that dependent resource is forced to be deserialized first.
      const serializedOutput = service.serialize([resource2, resource1]);
      const resources = await service.deserialize(serializedOutput);

      const resource1Deserialized = resources['resource-1'];
      const resource2Deserialized = resource1Deserialized.getChildren()['test-resource'][0]
        .to as AResource<TestResource>;
      expect(resource2Deserialized.resourceId).toBe('resource-2');
      expect((resource2Deserialized.getParents()['test-resource'][0].to as AResource<TestResource>).resourceId).toBe(
        'resource-1',
      );
    });

    it('should have exact same dependencies on deserialized object as original object', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2');
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource1.addChild('resourceId', resource2, 'resourceId');
      const resource3 = new SharedTestResource('resource-3', {}, [resource1]);

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);
      service.registerClass('SharedTestResource', SharedTestResource);

      const resourcesSerialized = service.serialize([resource1, resource2, resource3]);
      const resourcesDeserialized = await service.deserialize(resourcesSerialized);

      const newResourcesDependencies = service
        .serialize(Object.values(resourcesDeserialized))
        .dependencies.sort((a, b) => (a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0));
      const oldResourcesDependencies = resourcesSerialized.dependencies.sort((a, b) =>
        a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
      );
      expect(newResourcesDependencies).toEqual(oldResourcesDependencies);
    });
  });

  describe('serialize()', () => {
    it('should serialize an empty array', () => {
      const service = new ResourceSerializationService();
      expect(service.serialize([])).toMatchSnapshot();
    });

    it('should serialize non-empty array', () => {
      const resources: UnknownResource[] = [new TestResource('resource-1')];

      const service = new ResourceSerializationService();
      expect(service.serialize(resources)).toMatchSnapshot();
    });

    it('should not serialize resources marked for deletion', () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2');
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      resource2.markDeleted();

      const resources: UnknownResource[] = [resource1, resource2];
      const service = new ResourceSerializationService();
      expect(service.serialize(resources)).toMatchSnapshot();
    });

    it('should serialize dependencies and properties and resources', () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2');
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource1.addChild('resourceId', resource2, 'resourceId');
      const resources: UnknownResource[] = [resource1, resource2];

      const service = new ResourceSerializationService();
      expect(service.serialize(resources)).toMatchSnapshot();
    });

    it('should serialize shared resources', () => {
      const resource1 = new TestResource('resource-1');
      const resource2 = new SharedTestResource('resource-2', {}, [resource1]);
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      const resources: UnknownResource[] = [resource1, resource2];

      const service = new ResourceSerializationService();
      expect(service.serialize(resources)).toMatchSnapshot();
    });
  });
});
