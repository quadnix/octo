import { Dependency } from '../functions/dependency/dependency.model';
import {
  App,
  Diff,
  DiffAction,
  IAction,
  IActionInputs,
  IActionOutputs,
  IResourceAction,
  Region,
  Resource,
  ResourceSerializationService,
  SharedResource,
  TransactionService,
} from '../index';

class ParentResource extends Resource<ParentResource> {
  readonly MODEL_NAME: string = 'parent-resource';

  constructor(resourceId: string) {
    super(resourceId, {}, []);
  }
}

class TestResource extends Resource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string, properties: { [key: string]: string }, parents: [ParentResource]) {
    super(resourceId, properties, parents);
  }
}

class SharedTestResource extends SharedResource<TestResource> {
  constructor(resource: TestResource) {
    super(resource);
  }

  override async diff(previous?: SharedTestResource): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (previous) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'resourceId', this.resourceId));
    } else {
      diffs.push(new Diff(this, DiffAction.ADD, 'resourceId', this.resourceId));
    }

    return diffs;
  }
}

const universalResourceAction: IResourceAction = {
  ACTION_NAME: 'universal',
  filter: () => true,
  handle: jest.fn(),
};

describe('SharedResource UT', () => {
  it('should serialize and deserialize empty shared-resources', async () => {
    const service = new ResourceSerializationService();
    service.registerClass('ParentResource', ParentResource);
    service.registerClass('TestResource', TestResource);
    service.registerClass('SharedTestResource', SharedTestResource);

    const serializedOutput = service.serialize([]);
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
    const sharedTestResource = new SharedTestResource(testResource);

    const service = new ResourceSerializationService();
    service.registerClass('ParentResource', ParentResource);
    service.registerClass('TestResource', TestResource);
    service.registerClass('SharedTestResource', SharedTestResource);

    const serializedOutput = service.serialize([parentResource, sharedTestResource]);
    expect(serializedOutput).toMatchInlineSnapshot(`
      {
        "dependencies": [
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "resourceId",
                "toField": "resourceId",
              },
            ],
            "from": "parent-resource=parent-1",
            "relationship": {
              "onField": "resourceId",
              "toField": "resourceId",
              "type": "parent",
            },
            "to": "test-resource=resource-1",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "resourceId",
                "toField": "resourceId",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "resourceId",
                "toField": "resourceId",
              },
            ],
            "from": "test-resource=resource-1",
            "relationship": {
              "onField": "resourceId",
              "toField": "resourceId",
              "type": "child",
            },
            "to": "parent-resource=parent-1",
          },
        ],
        "resources": {
          "parent-1": {
            "className": "ParentResource",
            "isSharedResource": false,
            "resource": {
              "properties": {},
              "resourceId": "parent-1",
              "response": {},
            },
          },
          "resource-1": {
            "className": "TestResource",
            "isSharedResource": true,
            "resource": {
              "properties": {},
              "resourceId": "resource-1",
              "response": {},
            },
          },
        },
        "sharedResources": {
          "resource-1": {
            "className": "SharedTestResource",
            "resourceClassName": "TestResource",
            "sharedResource": {
              "properties": {
                "property1": "property-value-1",
              },
              "resourceId": "resource-1",
              "response": {
                "response1": "response-value-1",
              },
            },
          },
        },
      }
    `);

    const resources = await service.deserialize(serializedOutput);

    expect(resources['parent-1'].resourceId).toBe('parent-1');
    expect(resources['parent-1'].properties).toEqual({});
    expect(resources['parent-1'].response).toEqual({});
    expect(resources['parent-1']['dependencies'].length).toBe(1);

    expect(resources['resource-1'].resourceId).toBe('resource-1');
    expect(resources['resource-1'].properties).toEqual({ property1: 'property-value-1' });
    expect(resources['resource-1'].response).toEqual({ response1: 'response-value-1' });
    expect(resources['resource-1']['dependencies'].length).toBe(1);
  });

  /**
   * In practice, shared resources will most likely have more than 1 parent, often spanning across multiple regions.
   * E.g. an image being shared across multiple regions. The shared resource model internally manages the real
   * resources across many regions, but from the model's perspective, the shared resource model is global.
   */
  it('should serialize and deserialize shared-resources with different parents', async () => {
    const app = new App('app');

    const serializationService = new ResourceSerializationService();
    serializationService.registerClass('ParentResource', ParentResource);
    serializationService.registerClass('TestResource', TestResource);
    serializationService.registerClass('SharedTestResource', SharedTestResource);

    // Assume a region is being created.
    const region1 = new Region('region-1');
    app.addRegion(region1);
    const diffs1 = [new Diff(region1, DiffAction.ADD, 'regionId', 'region-1')];

    // The region-1 determined its resources will have a parent resource, and a shared resource parented by parent-1.
    const parentResource1 = new ParentResource('parent-1');
    const testResource1 = new TestResource('shared-resource', { 'property-1': 'value-1' }, [parentResource1]);
    const sharedTestResource1 = new SharedTestResource(testResource1);
    // Assume the shared resource is applied, and response is collected.
    sharedTestResource1.response['response1'] = 'response-value-1';

    const addRegion1Action: IAction<IActionInputs, IActionOutputs> = {
      ACTION_NAME: 'test',
      collectInput: () => [],
      collectOutput: () => ['parent-1', 'shared-resource'],
      filter: (diff: Diff) => {
        return diff.value === 'region-1';
      },
      handle: jest.fn().mockReturnValue({
        'parent-1': parentResource1,
        'shared-resource': sharedTestResource1,
      }),
      revert: jest.fn(),
    };

    const service = new TransactionService();
    service.registerModelActions([addRegion1Action]);
    service.registerResourceActions([universalResourceAction]);
    const generator1 = service.beginTransaction(diffs1, {}, {}, { yieldNewResources: true });

    // Validate shared resources properties, responses, and dependencies are serialized correctly.
    const newResources1 = await generator1.next();
    const serializedOutput1 = serializationService.serialize(newResources1.value as Resource<unknown>[]);
    expect(serializedOutput1).toMatchInlineSnapshot(`
      {
        "dependencies": [
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "resourceId",
                "toField": "resourceId",
              },
            ],
            "from": "parent-resource=parent-1",
            "relationship": {
              "onField": "resourceId",
              "toField": "resourceId",
              "type": "parent",
            },
            "to": "test-resource=shared-resource",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "resourceId",
                "toField": "resourceId",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "resourceId",
                "toField": "resourceId",
              },
            ],
            "from": "test-resource=shared-resource",
            "relationship": {
              "onField": "resourceId",
              "toField": "resourceId",
              "type": "child",
            },
            "to": "parent-resource=parent-1",
          },
        ],
        "resources": {
          "parent-1": {
            "className": "ParentResource",
            "isSharedResource": false,
            "resource": {
              "properties": {},
              "resourceId": "parent-1",
              "response": {},
            },
          },
          "shared-resource": {
            "className": "TestResource",
            "isSharedResource": true,
            "resource": {
              "properties": {},
              "resourceId": "shared-resource",
              "response": {},
            },
          },
        },
        "sharedResources": {
          "shared-resource": {
            "className": "SharedTestResource",
            "resourceClassName": "TestResource",
            "sharedResource": {
              "properties": {
                "property-1": "value-1",
              },
              "resourceId": "shared-resource",
              "response": {
                "response1": "response-value-1",
              },
            },
          },
        },
      }
    `);

    // Assume another region is created.
    const region2 = new Region('region-2');
    app.addRegion(region2);
    const diffs2 = [new Diff(region2, DiffAction.ADD, 'regionId', 'region-2')];

    // The region-2 determined its resources will have a parent resource, and a shared resource parented by parent-2.
    const parentResource2 = new ParentResource('parent-2');
    const testResource2 = new TestResource('shared-resource', { 'property-2': 'value-2' }, [parentResource2]);
    const sharedTestResource2 = new SharedTestResource(testResource2);
    // Assume the shared resource is applied, and response is collected.
    sharedTestResource2.response['response2'] = 'response-value-2';

    const addRegion2Action: IAction<IActionInputs, IActionOutputs> = {
      ACTION_NAME: 'test',
      collectInput: () => [],
      collectOutput: () => ['parent-2', 'shared-resource'],
      filter: (diff: Diff) => {
        return diff.value === 'region-2';
      },
      handle: jest.fn().mockReturnValue({
        'parent-2': parentResource2,
        'shared-resource': sharedTestResource2,
      }),
      revert: jest.fn(),
    };

    service.registerModelActions([addRegion2Action]);
    const generator2 = service.beginTransaction(
      diffs2,
      {
        'parent-1': parentResource1,
        'shared-resource': sharedTestResource1,
      },
      {
        'parent-1': parentResource1,
        'shared-resource': sharedTestResource1,
      },
      {
        yieldNewResources: true,
      },
    );

    // Validate shared resources properties, responses, and dependencies are serialized correctly.
    const newResources2 = await generator2.next();
    const serializedOutput2 = serializationService.serialize(newResources2.value as Resource<unknown>[]);
    expect(serializedOutput2).toMatchInlineSnapshot(`
      {
        "dependencies": [
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "resourceId",
                "toField": "resourceId",
              },
            ],
            "from": "parent-resource=parent-1",
            "relationship": {
              "onField": "resourceId",
              "toField": "resourceId",
              "type": "parent",
            },
            "to": "test-resource=shared-resource",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "resourceId",
                "toField": "resourceId",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "resourceId",
                "toField": "resourceId",
              },
            ],
            "from": "test-resource=shared-resource",
            "relationship": {
              "onField": "resourceId",
              "toField": "resourceId",
              "type": "child",
            },
            "to": "parent-resource=parent-2",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "resourceId",
                "toField": "resourceId",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "resourceId",
                "toField": "resourceId",
              },
            ],
            "from": "test-resource=shared-resource",
            "relationship": {
              "onField": "resourceId",
              "toField": "resourceId",
              "type": "child",
            },
            "to": "parent-resource=parent-1",
          },
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "resourceId",
                "toField": "resourceId",
              },
            ],
            "from": "parent-resource=parent-2",
            "relationship": {
              "onField": "resourceId",
              "toField": "resourceId",
              "type": "parent",
            },
            "to": "test-resource=shared-resource",
          },
        ],
        "resources": {
          "parent-1": {
            "className": "ParentResource",
            "isSharedResource": false,
            "resource": {
              "properties": {},
              "resourceId": "parent-1",
              "response": {},
            },
          },
          "parent-2": {
            "className": "ParentResource",
            "isSharedResource": false,
            "resource": {
              "properties": {},
              "resourceId": "parent-2",
              "response": {},
            },
          },
          "shared-resource": {
            "className": "TestResource",
            "isSharedResource": true,
            "resource": {
              "properties": {},
              "resourceId": "shared-resource",
              "response": {},
            },
          },
        },
        "sharedResources": {
          "shared-resource": {
            "className": "SharedTestResource",
            "resourceClassName": "TestResource",
            "sharedResource": {
              "properties": {
                "property-1": "value-1",
                "property-2": "value-2",
              },
              "resourceId": "shared-resource",
              "response": {
                "response1": "response-value-1",
                "response2": "response-value-2",
              },
            },
          },
        },
      }
    `);
  });

  describe('merge()', () => {
    it('should merge new shared resource with self and return new shared resource', () => {
      const resource1 = new ParentResource('resource-1');

      const sharedResource1 = new SharedTestResource(resource1);
      sharedResource1['dependencies'].push(new Dependency(resource1, resource1));
      sharedResource1['properties']['property-1'] = 'property-value-1';
      sharedResource1['response']['response-1'] = 'response-value-1';

      const sharedResource2 = new SharedTestResource(resource1);
      sharedResource2['dependencies'].push(new Dependency(resource1, resource1));
      sharedResource2['properties']['property-2'] = 'property-value-2';
      sharedResource2['response']['response-2'] = 'response-value-2';

      // We place an additional identifier in sharedResource2, since these identifiers do not partake in merge.
      // If the mergedSharedResource contains this identifier,
      // then we ensure that the mergedSharedResource is same as sharedResource2.
      sharedResource2.markUpdated('update-1', 'update-value-1');
      const mergedSharedResource = sharedResource1.merge(sharedResource2);

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
      expect(mergedSharedResource.getUpdateMarker()).toMatchInlineSnapshot(`
        {
          "key": "update-1",
          "value": "update-value-1",
        }
      `);
    });
  });
});
