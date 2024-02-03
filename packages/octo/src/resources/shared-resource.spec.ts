import { Container } from '../decorators/container.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { ResourceDataRepository } from './resource-data.repository.js';
import { AResource } from './resource.abstract.js';
import { ASharedResource } from './shared-resource.abstract.js';

class ParentResource extends AResource<ParentResource> {
  readonly MODEL_NAME: string = 'parent-resource';

  constructor(resourceId: string) {
    super(resourceId, {}, []);
  }
}

class TestResource extends AResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string, properties: { [key: string]: string }, parents: [ParentResource]) {
    super(resourceId, properties, parents);
  }
}

class SharedTestResource extends ASharedResource<TestResource> {
  readonly MODEL_NAME: string = 'shared-test-resource';

  constructor(resourceId: string, properties: object, parents: [TestResource?, TestResource?]) {
    super(resourceId, {}, parents as AResource<TestResource>[]);
  }
}

describe('SharedResource UT', () => {
  let resourceSerializationService: ResourceSerializationService;

  beforeAll(async () => {
    resourceSerializationService = await Container.get(ResourceSerializationService);
    resourceSerializationService.registerClass(ParentResource.name, ParentResource);
    resourceSerializationService.registerClass(TestResource.name, TestResource);
    resourceSerializationService.registerClass(SharedTestResource.name, SharedTestResource);
  });

  afterAll(() => {
    Container.reset();
  });

  it('should serialize and deserialize empty shared-resources', async () => {
    await Container.get(ResourceDataRepository, { args: [true, [], []] });

    const serializedOutput = await resourceSerializationService.serialize();
    expect(serializedOutput).toMatchInlineSnapshot(`
      {
        "dependencies": [],
        "resources": {},
        "sharedResources": {},
      }
    `);
  });

  it('should serialize and deserialize shared-resources with parent', async () => {
    const parentResource = new ParentResource('parent-1');
    const testResource = new TestResource('resource-1', { property1: 'property-value-1' }, [parentResource]);
    testResource.response['response1'] = 'response-value-1';
    const sharedTestResource = new SharedTestResource('shared-test-resource', {}, [testResource]);

    const resources = [parentResource, testResource, sharedTestResource];
    await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

    const serializedOutput = await resourceSerializationService.serialize();
    await resourceSerializationService.deserialize(serializedOutput);

    const resourceDataRepository = await Container.get(ResourceDataRepository);
    const deserializedResources = resourceDataRepository.getByProperties();

    // Validate shared resources are same pre/post serialization.
    expect(deserializedResources.sort((a, b) => a.resourceId.localeCompare(b.resourceId))).toEqual(
      resources.sort((a, b) => a.resourceId.localeCompare(b.resourceId)),
    );
  });

  it('should serialize and deserialize shared-resources with different parents', async () => {
    // "resource-1" is a shared-resource(S1) parented by "parent-1".
    const parentResource1 = new ParentResource('parent-1');
    const testResource1 = new TestResource('resource-1', { property1: 'property-value-1' }, [parentResource1]);
    // "resource-2" is also a shared-resource(S1), but parented by "parent-2".
    const parentResource2 = new ParentResource('parent-2');
    const testResource2 = new TestResource('resource-2', { property2: 'property-value-2' }, [parentResource2]);
    const sharedTestResource = new SharedTestResource('shared-test-resource', {}, [testResource1, testResource2]);

    const resources = [parentResource1, testResource1, parentResource2, testResource2, sharedTestResource];
    await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

    const serializedOutput = await resourceSerializationService.serialize();
    await resourceSerializationService.deserialize(serializedOutput);

    const resourceDataRepository = await Container.get(ResourceDataRepository);
    const deserializedResources = resourceDataRepository.getByProperties();

    // Validate shared resources are same pre/post serialization.
    expect(deserializedResources.sort((a, b) => a.resourceId.localeCompare(b.resourceId))).toEqual(
      resources.sort((a, b) => a.resourceId.localeCompare(b.resourceId)),
    );
  });

  describe('merge()', () => {
    it('should merge old shared resource with self and return new shared resource', () => {
      const resource1 = new ParentResource('resource-1');
      const resource2 = new ParentResource('resource-2');

      const sharedResource1 = new SharedTestResource('shared-resource', {}, [resource1]);
      sharedResource1.properties['property-1'] = 'property-value-1';
      sharedResource1.response['response-1'] = 'response-value-1';

      const sharedResource2 = new SharedTestResource('shared-resource', {}, [resource2]);
      sharedResource2.properties['property-2'] = 'property-value-2';
      sharedResource2.response['response-2'] = 'response-value-2';

      const mergedSharedResource = sharedResource2.merge(sharedResource1);

      expect(mergedSharedResource['dependencies'].length).toBe(2);
      expect(mergedSharedResource.properties).toMatchInlineSnapshot(`
        {
          "property-1": "property-value-1",
          "property-2": "property-value-2",
        }
      `);
      expect(mergedSharedResource.response).toMatchInlineSnapshot(`
        {
          "response-1": "response-value-1",
          "response-2": "response-value-2",
        }
      `);
    });
  });
});
