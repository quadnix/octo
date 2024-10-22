import { SharedTestResource, TestResource } from '../../../../test/helpers/test-classes.js';
import { commitResources, createTestResources } from '../../../../test/helpers/test-models.js';
import { type ResourceSerializedOutput } from '../../../app.type.js';
import type { Container } from '../../../functions/container/container.js';
import { TestContainer } from '../../../functions/container/test-container.js';
import { ResourceDataRepository, ResourceDataRepositoryFactory } from '../../../resources/resource-data.repository.js';
import { type AResource } from '../../../resources/resource.abstract.js';
import { ResourceSerializationService } from './resource-serialization.service.js';

describe('Resource Serialization Service UT', () => {
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
    const resourceDataRepository = await container.get<ResourceDataRepository, typeof ResourceDataRepositoryFactory>(
      ResourceDataRepository,
      { args: [true, [], [], []] },
    );

    const resourceSerializationService = new ResourceSerializationService(resourceDataRepository);
    resourceSerializationService.registerClass('@octo/SharedTestResource', SharedTestResource);
    resourceSerializationService.registerClass('@octo/TestResource', TestResource);
    container.registerValue<ResourceSerializationService>(ResourceSerializationService, resourceSerializationService);
  });

  afterEach(() => {
    TestContainer.reset();
  });

  describe('deserialize()', () => {
    it('should throw error when de-serializing an unknown class', async () => {
      const service = await container.get(ResourceSerializationService);

      const serializedOutput: ResourceSerializedOutput = {
        dependencies: [],
        resources: {
          'resource-1': {
            className: 'ClassNotExist',
            context: 'resource=resource-1',
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
        await service.deserialize(serializedOutput, serializedOutput);
      }).rejects.toThrow();
    });

    it('should deserialize a single resource', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(1);

      expect(resourceDataRepository['oldResources']).toMatchSnapshot();
    });

    it('should deserialize a resource with complex properties', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = { key2: { key3: 'value3' }, key4: 'value4' };
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(1);

      expect(resourceDataRepository['oldResources']).toMatchSnapshot();
    });

    it('should deserialize a single shared resource', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] }, { 'resource-2': ['resource-1'] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(2);

      expect(resourceDataRepository['oldResources'].map((r) => r.getContext())).toMatchSnapshot();
    });

    it('should deserialize dependencies', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

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
      const resourceDataRepository = await container.get(ResourceDataRepository);

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
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const [resource1, resource2] = await createTestResources(
        { 'resource-1': [], 'resource-2': ['resource-1'] },
        { 'resource-3': ['resource-1'] },
      );
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      expect(resourceDataRepository['newResources']).toHaveLength(3);
      const previousResourceDependencies = resourceDataRepository['newResources']
        .map((r) => r.getDependencies().map((d) => d.synth()))
        .flat()
        .sort((a, b) => (a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0));

      await commitResources();

      expect(resourceDataRepository['oldResources']).toHaveLength(3);
      const currentResourceDependencies = resourceDataRepository['oldResources']
        .map((r) => r.getDependencies().map((d) => d.synth()))
        .flat()
        .sort((a, b) => (a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0));

      expect(previousResourceDependencies).toEqual(currentResourceDependencies);
    });

    it('should initialize ResourceDataRepository with separate old and new resources', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(1);

      // Manipulate new resources.
      resourceDataRepository.getActualResourceById('resource-1')!.properties['key1'] = 'value2';
      expect(resourceDataRepository['actualResources'][0]).not.toEqual(resourceDataRepository['oldResources'][0]);
    });

    it('should not initialize ResourceDataRepository with new resources marked for deletion', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(1);

      // Remove the new resource.
      resourceDataRepository.removeNewResource(resource1);

      expect(resourceDataRepository['oldResources']).toHaveLength(1);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(0);
    });
  });

  describe('serialize()', () => {
    it('should serialize an empty array', async () => {
      const service = await container.get(ResourceSerializationService);

      expect(await service.serializeNewResources()).toMatchSnapshot();
    });

    it('should serialize non-empty array', async () => {
      await createTestResources({ 'resource-1': [] });

      const service = await container.get(ResourceSerializationService);

      expect(await service.serializeNewResources()).toMatchSnapshot();
    });

    it('should not serialize deleted resources', async () => {
      const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource2.remove();

      const service = await container.get(ResourceSerializationService);

      expect(await service.serializeNewResources()).toMatchSnapshot();
    });

    it('should serialize dependencies and properties and resources', async () => {
      const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      const service = await container.get(ResourceSerializationService);

      expect(await service.serializeNewResources()).toMatchSnapshot();
    });

    it('should serialize shared resources', async () => {
      const [resource1, resource2] = await createTestResources({ 'resource-1': [] }, { 'resource-2': ['resource-1'] });
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      const service = await container.get(ResourceSerializationService);

      expect(await service.serializeNewResources()).toMatchSnapshot();
    });
  });
});
