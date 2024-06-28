import { SharedTestResource, TestResource } from '../../../../test/helpers/test-classes.js';
import { type UnknownResource } from '../../../app.type.js';
import { Container } from '../../../decorators/container.js';
import { ResourceDataRepository, ResourceDataRepositoryFactory } from '../../../resources/resource-data.repository.js';
import { type AResource } from '../../../resources/resource.abstract.js';
import { ResourceSerializationService, ResourceSerializationServiceFactory } from './resource-serialization.service.js';

describe('Resource Serialization Service UT', () => {
  beforeEach(() => {
    Container.registerFactory(ResourceDataRepository, ResourceDataRepositoryFactory);
    Container.get(ResourceDataRepository, { args: [true, [], []] });

    Container.registerFactory(ResourceSerializationService, ResourceSerializationServiceFactory);
    Container.get(ResourceSerializationService, { args: [true] });
  });

  afterEach(() => {
    Container.reset();
  });

  describe('deserialize()', () => {
    it('should throw error when de-serializing an unknown class', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      const resources = [resource1];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService, { args: [true] });

      await expect(async () => {
        const serializedOutput = await service.serialize();
        await service.deserialize(serializedOutput);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Cannot read properties of undefined (reading 'unSynth')"`);
    });

    it('should deserialize a single resource', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      const resources = [resource1];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService, { args: [true] });
      service.registerClass('TestResource', TestResource);

      const serializedOutput = await service.serialize();
      await service.deserialize(serializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository['oldResources'];
      expect(deserializedResources).toMatchSnapshot();
    });

    it('should deserialize a resource with complex properties', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = { key2: { key3: 'value3' }, key4: 'value4' };
      resource1.response['response1'] = 'value1';

      const resources = [resource1];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService);
      service.registerClass('TestResource', TestResource);

      const serializedOutput = await service.serialize();
      await service.deserialize(serializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository['oldResources'];
      expect(deserializedResources).toMatchSnapshot();
    });

    it('should deserialize a single shared resource', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new SharedTestResource('resource-2', {}, [resource1]);

      const resources = [resource1, resource2];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService);
      service.registerClass('TestResource', TestResource);
      service.registerClass('SharedTestResource', SharedTestResource);

      const serializedOutput = await service.serialize();
      await service.deserialize(serializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository['oldResources'];
      expect(deserializedResources).toMatchSnapshot();
    });

    it('should throw error trying to deserialize a shared resource without corresponding resource', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new SharedTestResource('resource-2', {}, [resource1]);

      const resources = [resource2];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService, { args: [true] });
      service.registerClass('TestResource', TestResource);
      service.registerClass('SharedTestResource', SharedTestResource);
      service.setResourceDeserializationTimeout(50);

      const serializedOutput = await service.serialize();

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

      const resources = [resource1, resource2];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService);
      service.registerClass('TestResource', TestResource);

      const serializedOutput = await service.serialize();
      await service.deserialize(serializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository['oldResources'];

      const resource1Deserialized = deserializedResources.find((r) => r.resourceId === 'resource-1');
      const resource2Deserialized = resource1Deserialized!.getChildren()['test-resource'][0]
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

      const resources = [resource2, resource1]; // Reverse order of resources.
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService);
      service.registerClass('TestResource', TestResource);

      const serializedOutput = await service.serialize();
      await service.deserialize(serializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository['oldResources'];

      const resource1Deserialized = deserializedResources.find((r) => r.resourceId === 'resource-1');
      const resource2Deserialized = resource1Deserialized!.getChildren()['test-resource'][0]
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

      const resources = [resource1, resource2, resource3];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService);
      service.registerClass('TestResource', TestResource);
      service.registerClass('SharedTestResource', SharedTestResource);

      const serializedOutput1 = await service.serialize();
      const currentResourceDependencies = serializedOutput1.dependencies.sort((a, b) =>
        a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
      );

      await service.deserialize(serializedOutput1);
      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository['oldResources'];

      // An easy way to get dependencies from `deserializedResources` is to serialize it again.
      await Container.get(ResourceDataRepository, {
        args: [true, [...deserializedResources], [...deserializedResources]],
      });
      const serializedOutput2 = await service.serialize();
      const previousResourcesDependencies = serializedOutput2.dependencies.sort((a, b) =>
        a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
      );

      expect(previousResourcesDependencies).toEqual(currentResourceDependencies);
    });

    it('should initialize ResourceDataRepository with separate old and new resources', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      const resources = [resource1];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService, { args: [true] });
      service.registerClass('TestResource', TestResource);

      const serializedOutput = await service.serialize();
      await service.deserialize(serializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);

      // Manipulate new resources. This must not affect old resources in any way.
      resourceDataRepository.getById('resource-1')!.properties['key1'] = 'value2';

      expect(resourceDataRepository['newResources'][0]).not.toEqual(resourceDataRepository['oldResources'][0]);
    });

    it('should not initialize ResourceDataRepository with new resources marked for deletion', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      const resources = [resource1];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService, { args: [true] });
      service.registerClass('TestResource', TestResource);

      const serializedOutput1 = await service.serialize();
      await service.deserialize(serializedOutput1);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      expect(resourceDataRepository.getById('resource-1')).not.toBeUndefined();

      // Remove the new resource.
      resourceDataRepository.remove(resource1);

      // Ensure the deleted resources are not initialized in the ResourceDataRepository.
      expect(resourceDataRepository.getById('resource-1')).toBeUndefined();

      const serializedOutput2 = await service.serialize();
      await service.deserialize(serializedOutput2);

      // Ensure the deleted resources are not initialized in the ResourceDataRepository.
      expect(resourceDataRepository['oldResources'].length).toBe(0);
    });
  });

  describe('serialize()', () => {
    it('should serialize an empty array', async () => {
      await Container.get(ResourceDataRepository, { args: [true, [], []] });

      const service = await Container.get(ResourceSerializationService);
      expect(await service.serialize()).toMatchSnapshot();
    });

    it('should serialize non-empty array', async () => {
      const resources: UnknownResource[] = [new TestResource('resource-1')];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService, { args: [true] });
      expect(await service.serialize()).toMatchSnapshot();
    });

    it('should not serialize deleted resources', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2');
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource2.remove();

      const resources = [resource1, resource2];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService, { args: [true] });
      expect(await service.serialize()).toMatchSnapshot();
    });

    it('should serialize dependencies and properties and resources', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2');
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource1.addChild('resourceId', resource2, 'resourceId');

      const resources = [resource1, resource2];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService, { args: [true] });
      expect(await service.serialize()).toMatchSnapshot();
    });

    it('should serialize shared resources', async () => {
      const resource1 = new TestResource('resource-1');
      const resource2 = new SharedTestResource('resource-2', {}, [resource1]);
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      const resources = [resource1, resource2];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(ResourceSerializationService, { args: [true] });
      expect(await service.serialize()).toMatchSnapshot();
    });
  });
});
