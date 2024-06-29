import { SharedTestResource, TestResource } from '../../../../test/helpers/test-classes.js';
import { commitResources, createTestResources } from '../../../../test/helpers/test-models.js';
import { type ResourceSerializedOutput } from '../../../app.type.js';
import { Container } from '../../../decorators/container.js';
import { ResourceDataRepository, ResourceDataRepositoryFactory } from '../../../resources/resource-data.repository.js';
import { type AResource } from '../../../resources/resource.abstract.js';
import { ResourceSerializationService, ResourceSerializationServiceFactory } from './resource-serialization.service.js';

describe('Resource Serialization Service UT', () => {
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

  describe('deserialize()', () => {
    it('should throw error when de-serializing an unknown class', async () => {
      const service = await Container.get(ResourceSerializationService);

      const serializedOutput: ResourceSerializedOutput = {
        dependencies: [],
        resources: {
          'resource-1': {
            className: 'ClassNotExist',
            resource: {
              properties: {},
              resourceId: 'resource=resource-1',
              response: {},
            },
          },
        },
        sharedResources: {},
      };

      await expect(async () => {
        await service.deserialize(serializedOutput);
      }).rejects.toThrow();
    });

    it('should deserialize a single resource', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(1);

      expect(resourceDataRepository['oldResources']).toMatchSnapshot();
    });

    it('should deserialize a resource with complex properties', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = { key2: { key3: 'value3' }, key4: 'value4' };
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(1);

      expect(resourceDataRepository['oldResources']).toMatchSnapshot();
    });

    it('should deserialize a single shared resource', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] }, { 'resource-2': ['resource-1'] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(2);

      expect(resourceDataRepository['oldResources'].map((r) => r.getContext())).toMatchSnapshot();
    });

    it('should deserialize dependencies', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(2);

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
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      // Reverse order of resources.
      // eslint-disable-next-line sort-keys
      const [resource2, resource1] = await createTestResources({ 'resource-2': [], 'resource-1': [] });
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource1.addChild('resourceId', resource2, 'resourceId');

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(2);

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
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [resource1, resource2] = await createTestResources(
        { 'resource-1': [], 'resource-2': ['resource-1'] },
        { 'resource-3': ['resource-1'] },
      );
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(3);

      const previousResourceDependencies = resourceDataRepository['oldResources']
        .map((r) => r.getDependencies().map((d) => d.synth()))
        .flat()
        .sort((a, b) => (a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0));
      const currentResourceDependencies = resourceDataRepository['newResources']
        .map((r) => r.getDependencies().map((d) => d.synth()))
        .flat()
        .sort((a, b) => (a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0));
      expect(previousResourceDependencies).toEqual(currentResourceDependencies);
    });

    it('should initialize ResourceDataRepository with separate old and new resources', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(1);

      expect(resourceDataRepository['newResources'][0]).toEqual(resourceDataRepository['oldResources'][0]);
      // Manipulate new resources.
      resourceDataRepository.getById('resource-1')!.properties['key1'] = 'value2';
      expect(resourceDataRepository['newResources'][0]).not.toEqual(resourceDataRepository['oldResources'][0]);
    });

    it('should not initialize ResourceDataRepository with new resources marked for deletion', async () => {
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(1);

      // Remove the new resource.
      resourceDataRepository.remove(resource1);

      expect(resourceDataRepository['oldResources']).toHaveLength(1);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(0);
    });
  });

  describe('serialize()', () => {
    it('should serialize an empty array', async () => {
      const service = await Container.get(ResourceSerializationService);

      expect(await service.serialize()).toMatchSnapshot();
    });

    it('should serialize non-empty array', async () => {
      await createTestResources({ 'resource-1': [] });

      const service = await Container.get(ResourceSerializationService);

      expect(await service.serialize()).toMatchSnapshot();
    });

    it('should not serialize deleted resources', async () => {
      const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource2.remove();

      const service = await Container.get(ResourceSerializationService);

      expect(await service.serialize()).toMatchSnapshot();
    });

    it('should serialize dependencies and properties and resources', async () => {
      const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      const service = await Container.get(ResourceSerializationService);

      expect(await service.serialize()).toMatchSnapshot();
    });

    it('should serialize shared resources', async () => {
      const [resource1, resource2] = await createTestResources({ 'resource-1': [] }, { 'resource-2': ['resource-1'] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      const service = await Container.get(ResourceSerializationService);

      expect(await service.serialize()).toMatchSnapshot();
    });
  });
});
