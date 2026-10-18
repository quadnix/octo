import type { ResourceSerializedOutput, UnknownResource } from '../../../app.type.js';
import type { Container } from '../../../functions/container/container.js';
import { TestContainer } from '../../../functions/container/test-container.js';
import { ResourceDataRepository } from '../../../resources/resource-data.repository.js';
import { create } from '../../../utilities/test-helpers/test-models.js';
import { TEST_MODULE_ID } from '../../../utilities/test-helpers/test-modules.js';
import {
  commitResources,
  createResource,
  createTestResources,
} from '../../../utilities/test-helpers/test-resources.js';
import { InputService } from '../../input/input.service.js';
import { ResourceSerializationService } from './resource-serialization.service.js';

const TestResource = createResource('test-resource').setClassName('TestResource');

describe('Resource Serialization Service UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500, force: true });
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  describe('deserialize()', () => {
    it('should throw error when de-serializing an unknown class', async () => {
      const service = await container.get(ResourceSerializationService);

      const serializedOutput: ResourceSerializedOutput = {
        dependencies: [],
        resources: {
          'resource-1': {
            className: 'ClassNotExist',
            kind: 'external',
            models: [],
            moduleId: TEST_MODULE_ID,
            resource: {
              localResourceId: 'resource=resource-1',
              parents: [],
              properties: {},
              resourceId: 'resource=resource-1',
              response: {},
              scope: [],
              tags: {},
            },
          },
        },
      };

      await expect(async () => {
        await service.deserialize(serializedOutput, serializedOutput);
      }).rejects.toThrow();
    });

    it('should deserialize a single resource', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(1);

      expect(resourceDataRepository['oldResources']).toMatchSnapshot();
    });

    it('should deserialize a resource with complex properties', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);
      resource1.properties['key1'] = { key2: { key3: 'value3' }, key4: 'value4' };
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(1);

      expect(resourceDataRepository['oldResources']).toMatchSnapshot();
    });

    it('should deserialize multiple resources', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
      ]);
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(2);

      expect(resourceDataRepository['oldResources'].map((r) => r.getContext())).toMatchSnapshot();
    });

    it('should deserialize dependencies', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
        ]);
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(2);

      const deserializedResources = resourceDataRepository['oldResources'];
      const resource1Deserialized = deserializedResources.find((r) => r.resourceId === 'resource-1');
      const resource2Deserialized = resource1Deserialized!.getChildren()['test-resource'][0].to as UnknownResource;
      expect(resource2Deserialized.resourceId).toBe('resource-2');
      expect((resource2Deserialized.getParents()['test-resource'][0].to as UnknownResource).resourceId).toBe(
        'resource-1',
      );
    });

    it('should deserialize dependencies in reverse order', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      // Reverse order of resources.
      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-2' },
          { resourceContext: '@octo/test-resource=resource-1' },
        ]);
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
      const resource2Deserialized = resource1Deserialized!.getChildren()['test-resource'][0].to as UnknownResource;
      expect(resource2Deserialized.resourceId).toBe('resource-2');
      expect((resource2Deserialized.getParents()['test-resource'][0].to as UnknownResource).resourceId).toBe(
        'resource-1',
      );
    });

    it('should have exact same dependencies on deserialized object as original object', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
          {
            parents: ['@octo/test-resource=resource-1'],
            resourceContext: '@octo/test-resource=resource-3',
          },
        ]);
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

      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';

      expect(resourceDataRepository['oldResources']).toHaveLength(0);
      await commitResources();
      expect(resourceDataRepository['oldResources']).toHaveLength(1);

      // Manipulate new resources.
      resourceDataRepository.getActualResourceByContext('@octo/test-resource=resource-1')!.properties['key1'] =
        'value2';
      expect(resourceDataRepository['actualResources'][0]).not.toEqual(resourceDataRepository['oldResources'][0]);
    });

    it('should not initialize ResourceDataRepository with new resources marked for deletion', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);

      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);
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
    it('should throw error when a resource is not associated with any module', async () => {
      const resourceDataRepository = await container.get(ResourceDataRepository);
      resourceDataRepository.addNewResource(new TestResource('resource-1'));

      const service = await container.get(ResourceSerializationService);

      await expect(async () => {
        await service.serializeNewResources();
      }).rejects.toMatchInlineSnapshot(`[Error: Resource is not associated with any module!]`);
    });

    it('should serialize an empty array', async () => {
      const service = await container.get(ResourceSerializationService);

      expect(await service.serializeNewResources()).toMatchSnapshot();
    });

    it('should serialize non-empty array', async () => {
      await createTestResources([{ resourceContext: '@octo/test-resource=resource-1' }]);

      const service = await container.get(ResourceSerializationService);

      expect(await service.serializeNewResources()).toMatchSnapshot();
    });

    it('should serialize a resource terraform owns as terraform', async () => {
      await createTestResources([{ resourceContext: '@octo/test-resource=resource-1', terraform: true }]);

      const service = await container.get(ResourceSerializationService);

      expect((await service.serializeNewResources()).resources['@octo/test-resource=resource-1'].kind).toBe(
        'terraform',
      );
    });

    it('should serialize every model whose action produced a resource', async () => {
      const inputService = await container.get(InputService);
      const {
        account: [account],
        app: [app],
      } = create({ account: ['aws,account'], app: ['test-app'] });
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);
      inputService.registerResourceModel(resource1, app);
      inputService.registerResourceModel(resource1, account);
      inputService.registerResourceModel(resource1, app);

      const service = await container.get(ResourceSerializationService);

      expect((await service.serializeNewResources()).resources['@octo/test-resource=resource-1'].models).toEqual([
        'account=account,app=test-app',
        'app=test-app',
      ]);
    });

    it('should keep the module, creator and models a committed resource recorded when no command produced it', async () => {
      await createTestResources([{ resourceContext: '@octo/test-resource=resource-1' }]);
      const record: ResourceSerializedOutput['resources'][string] = {
        className: '@octo/test-resource',
        createdBy: 'app=old-app',
        kind: 'external',
        models: ['app=old-app'],
        moduleId: 'old-module',
        resource: {
          localResourceId: 'resource-2',
          parents: [],
          properties: {},
          resourceId: 'resource-2',
          response: {},
          scope: [],
          tags: {},
        },
      };

      const service = await container.get(ResourceSerializationService);
      await service.deserialize(
        { dependencies: [], resources: { '@octo/test-resource=resource-2': record } },
        { dependencies: [], resources: {} },
      );

      expect((await service.serializeActualResources()).resources['@octo/test-resource=resource-2']).toEqual(record);
    });

    it('should not serialize deleted resources', async () => {
      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          { resourceContext: '@octo/test-resource=resource-2' },
        ]);
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource2.remove();

      const service = await container.get(ResourceSerializationService);

      expect(await service.serializeNewResources()).toMatchSnapshot();
    });

    it('should serialize dependencies and properties and resources', async () => {
      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
        ]);
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      const service = await container.get(ResourceSerializationService);

      expect(await service.serializeNewResources()).toMatchSnapshot();
    });

    it('should serialize multiple resources', async () => {
      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
        ]);
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';

      const service = await container.get(ResourceSerializationService);

      expect(await service.serializeNewResources()).toMatchSnapshot();
    });
  });
});
