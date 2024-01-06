import { jest } from '@jest/globals';
import { ActionInputs, ActionOutputs, UnknownResource } from '../app.type.js';
import { Container } from '../decorators/container.js';
import { Factory } from '../decorators/factory.decorator.js';
import { Resource } from '../decorators/resource.decorator.js';
import { Diff, DiffAction } from '../functions/diff/diff.model.js';
import { IAction } from '../models/action.interface.js';
import { App } from '../models/app/app.model.js';
import { Region } from '../models/region/region.model.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import { IResourceAction } from './resource-action.interface.js';
import { AResource } from './resource.abstract.js';
import { ASharedResource } from './shared-resource.abstract.js';

@Factory<TransactionService>(TransactionService, { metadata: { key: 'test' } })
class TransactionServiceTestFactory {
  static async create(): Promise<TransactionService> {
    return new TransactionService();
  }
}

@Resource()
class ParentResource extends AResource<ParentResource> {
  readonly MODEL_NAME: string = 'parent-resource';

  constructor(resourceId: string) {
    super(resourceId, {}, []);
  }
}

@Resource()
class TestResource extends AResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string, properties: { [key: string]: string }, parents: [ParentResource]) {
    super(resourceId, properties, parents);
  }
}

@Resource()
class SharedTestResource extends ASharedResource<TestResource> {
  readonly MODEL_NAME: string = 'shared-test-resource';

  constructor(resourceId: string, properties: object, parents: [TestResource?]) {
    super(resourceId, {}, parents as AResource<TestResource>[]);
  }
}

const universalResourceAction: IResourceAction = {
  ACTION_NAME: 'universal',
  filter: () => true,
  handle: jest.fn() as jest.Mocked<any>,
};

describe('SharedResource UT', () => {
  let resourceSerializationService: ResourceSerializationService;
  let transactionService: TransactionService;

  beforeAll(async () => {
    Container.setDefault(TransactionService, TransactionServiceTestFactory);

    resourceSerializationService = await Container.get(ResourceSerializationService);
  });

  beforeEach(async () => {
    transactionService = await Container.get(TransactionService);
  });

  afterAll(() => {
    Container.reset();
  });

  it('should serialize and deserialize empty shared-resources', async () => {
    const serializedOutput = resourceSerializationService.serialize([]);
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

    const serializedOutput = resourceSerializationService.serialize([parentResource, testResource, sharedTestResource]);
    expect(serializedOutput).toMatchSnapshot();

    const resources = await resourceSerializationService.deserialize(serializedOutput);

    expect(resources['parent-1'].resourceId).toBe('parent-1');
    expect(resources['parent-1'].properties).toEqual({});
    expect(resources['parent-1'].response).toEqual({});
    expect(resources['parent-1']['dependencies'].length).toBe(1);

    expect(resources['resource-1'].resourceId).toBe('resource-1');
    expect(resources['resource-1'].properties).toEqual({ property1: 'property-value-1' });
    expect(resources['resource-1'].response).toEqual({ response1: 'response-value-1' });
    expect(resources['resource-1']['dependencies'].length).toBe(2);

    expect(resources['shared-test-resource'].resourceId).toBe('shared-test-resource');
    expect(resources['shared-test-resource']['dependencies'].length).toBe(1);
  });

  it('should serialize and deserialize shared-resources with different parents', async () => {
    const app = new App('app');

    // Assume a region is being created.
    const region1 = new Region('region-1');
    app.addRegion(region1);
    const diffs1 = [new Diff(region1, DiffAction.ADD, 'regionId', 'region-1')];

    // The region-1 determined its resources will have a parent resource, and a shared resource parented by parent-1.
    const parentResource1 = new ParentResource('parent-1');
    const testResource1 = new TestResource('resource-1', { property1: 'property-value-1' }, [parentResource1]);
    const sharedTestResource1 = new SharedTestResource('shared-test-resource', {}, [testResource1]);

    const addRegion1Action: IAction<ActionInputs, ActionOutputs> = {
      ACTION_NAME: 'test1',
      collectInput: () => [],
      collectOutput: () => ['parent-1', 'resource-1', 'shared-test-resource'],
      filter: (diff: Diff) => {
        return diff.value === 'region-1';
      },
      handle: (jest.fn() as jest.Mocked<any>).mockReturnValue({
        'parent-1': parentResource1,
        'resource-1': testResource1,
        'shared-test-resource': sharedTestResource1,
      }),
      revert: jest.fn() as jest.Mocked<any>,
    };

    transactionService.registerModelActions([addRegion1Action]);
    transactionService.registerResourceActions([universalResourceAction]);
    const generator1 = transactionService.beginTransaction(diffs1, {}, {}, { yieldNewResources: true });

    // Validate shared resources properties, responses, and dependencies are serialized correctly.
    const newResources1 = await generator1.next();
    const serializedOutput1 = resourceSerializationService.serialize(newResources1.value as UnknownResource[]);
    expect(serializedOutput1).toMatchSnapshot();

    // Assume another region is created.
    const region2 = new Region('region-2');
    app.addRegion(region2);
    const diffs2 = [new Diff(region2, DiffAction.ADD, 'regionId', 'region-2')];

    // The region-2 determined its resources will have a parent resource, and a shared resource parented by parent-2.
    const parentResource2 = new ParentResource('parent-2');
    const testResource2 = new TestResource('resource-2', { property2: 'property-value-2' }, [parentResource2]);
    const sharedTestResource2 = new SharedTestResource('shared-test-resource', {}, [testResource2]);

    const addRegion2Action: IAction<ActionInputs, ActionOutputs> = {
      ACTION_NAME: 'test2',
      collectInput: () => [],
      collectOutput: () => ['parent-2', 'resource-2', 'shared-test-resource'],
      filter: (diff: Diff) => {
        return diff.value === 'region-2';
      },
      handle: (jest.fn() as jest.Mocked<any>).mockReturnValue({
        'parent-2': parentResource2,
        'resource-2': testResource2,
        'shared-test-resource': sharedTestResource2,
      }),
      revert: jest.fn() as jest.Mocked<any>,
    };

    transactionService.registerModelActions([addRegion2Action]);
    const generator2 = transactionService.beginTransaction(
      diffs2,
      {
        'parent-1': parentResource1,
        'resource-1': testResource1,
        'shared-test-resource': sharedTestResource1,
      },
      // copy of old resources.
      {
        'parent-1': parentResource1,
        'resource-1': testResource1,
        'shared-test-resource': sharedTestResource1,
      },
      {
        yieldNewResources: true,
      },
    );

    // Validate shared resources properties, responses, and dependencies are serialized correctly.
    const newResources2 = await generator2.next();
    const serializedOutput2 = resourceSerializationService.serialize(newResources2.value as UnknownResource[]);
    expect(serializedOutput2).toMatchSnapshot();
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
