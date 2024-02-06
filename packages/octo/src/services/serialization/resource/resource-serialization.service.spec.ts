import { UnknownResource } from '../../../app.type.js';
import { Container } from '../../../decorators/container.js';
import { ResourceDataRepository, ResourceDataRepositoryFactory } from '../../../resources/resource-data.repository.js';
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
  beforeEach(() => {
    Container.registerFactory(ResourceDataRepository, ResourceDataRepositoryFactory);
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

      const service = new ResourceSerializationService();

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

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);

      const serializedOutput = await service.serialize();
      await service.deserialize(serializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository.getByProperties();
      expect(deserializedResources).toMatchSnapshot();
    });

    it('should deserialize a resource with complex properties', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = { key2: { key3: 'value3' }, key4: 'value4' };
      resource1.response['response1'] = 'value1';

      const resources = [resource1];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);

      const serializedOutput = await service.serialize();
      await service.deserialize(serializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository.getByProperties();
      expect(deserializedResources).toMatchSnapshot();
    });

    it('should deserialize a single shared resource', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new SharedTestResource('resource-2', {}, [resource1]);

      const resources = [resource1, resource2];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);
      service.registerClass('SharedTestResource', SharedTestResource);

      const serializedOutput = await service.serialize();
      await service.deserialize(serializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository.getByProperties();
      expect(deserializedResources).toMatchSnapshot();
    });

    it('should throw error trying to deserialize a shared resource without corresponding resource', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new SharedTestResource('resource-2', {}, [resource1]);

      const resources = [resource2];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = new ResourceSerializationService();
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

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);

      const serializedOutput = await service.serialize();
      await service.deserialize(serializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository.getByProperties();

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

      const resources = [resource2, resource1];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);

      const serializedOutput = await service.serialize();
      await service.deserialize(serializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository.getByProperties();

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

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);
      service.registerClass('SharedTestResource', SharedTestResource);

      const serializedOutput1 = await service.serialize();
      const oldResourcesDependencies = serializedOutput1.dependencies.sort((a, b) =>
        a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
      );

      await service.deserialize(serializedOutput1);
      const resourceDataRepository = await Container.get(ResourceDataRepository);
      const deserializedResources = resourceDataRepository.getByProperties();

      // An easy way to get dependencies from `deserializedResources` is to serialize it again.
      await Container.get(ResourceDataRepository, {
        args: [true, [...deserializedResources], [...deserializedResources]],
      });
      const serializedOutput2 = await service.serialize();
      const newResourcesDependencies = serializedOutput2.dependencies.sort((a, b) =>
        a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
      );

      expect(newResourcesDependencies).toEqual(oldResourcesDependencies);
    });

    it('should initialize ResourceDataRepository with separate old and new resources', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      const resources = [resource1];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);

      const serializedOutput = await service.serialize();
      await service.deserialize(serializedOutput);

      const resourceDataRepository = await Container.get(ResourceDataRepository);

      // Manipulate new resources. This must not affect old resources in any way.
      resourceDataRepository.getById('resource-1')!.properties['key1'] = 'value2';
      expect(resourceDataRepository['newResources'][0]).not.toEqual(resourceDataRepository['oldResources'][0]);
    });
  });

  describe('serialize()', () => {
    it('should serialize an empty array', async () => {
      await Container.get(ResourceDataRepository, { args: [true, [], []] });

      const service = new ResourceSerializationService();
      expect(await service.serialize()).toMatchSnapshot();
    });

    it('should serialize non-empty array', async () => {
      const resources: UnknownResource[] = [new TestResource('resource-1')];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = new ResourceSerializationService();
      expect(await service.serialize()).toMatchSnapshot();
    });

    it('should not serialize resources marked for deletion', async () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2');
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource2.markDeleted();

      const resources = [resource1, resource2];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = new ResourceSerializationService();
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

      const service = new ResourceSerializationService();
      expect(await service.serialize()).toMatchSnapshot();
    });

    it('should serialize shared resources', async () => {
      const resource1 = new TestResource('resource-1');
      const resource2 = new SharedTestResource('resource-2', {}, [resource1]);
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      const resources = [resource1, resource2];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = new ResourceSerializationService();
      expect(await service.serialize()).toMatchSnapshot();
    });
  });
});
