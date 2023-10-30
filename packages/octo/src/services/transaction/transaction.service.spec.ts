import 'reflect-metadata';

import { jest } from '@jest/globals';
import { Resource } from '../../decorators/resource.decorator.js';
import { DiffMetadata } from '../../functions/diff/diff-metadata.model.js';
import { Diff, DiffAction } from '../../functions/diff/diff.model.js';
import { IAction, IActionInputs, IActionOutputs } from '../../models/action.interface.js';
import { App } from '../../models/app/app.model.js';
import { Environment } from '../../models/environment/environment.model.js';
import { Region } from '../../models/region/region.model.js';
import { IResourceAction } from '../../resources/resource-action.interface.js';
import { AResource } from '../../resources/resource.abstract.js';
import { TransactionService } from './transaction.service.js';

@Resource(TestResource)
class TestResource extends AResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string) {
    super(resourceId, {}, []);
  }
}

@Resource(TestResourceWithDiffOverride)
class TestResourceWithDiffOverride extends AResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string) {
    super(resourceId, {}, []);
  }

  override async diff(): Promise<Diff[]> {
    return [];
  }
}

describe('TransactionService UT', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('applyModels()', () => {
    const universalModelAction: IAction<IActionInputs, IActionOutputs> = {
      ACTION_NAME: 'universal',
      collectInput: () => [],
      collectOutput: () => [],
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
      revert: jest.fn() as jest.Mocked<any>,
    };

    it('should return empty transaction if diffs is empty', async () => {
      const service = new TransactionService();
      const generator = service.beginTransaction([], {}, {}, { yieldModelTransaction: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should throw error when matching action not found', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const service = new TransactionService();
      const generator = service.beginTransaction(diffs, {}, {}, { yieldModelTransaction: true });

      await expect(async () => {
        await generator.next();
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"No matching action given for diff!"`);
    });

    it('should throw error when action inputs are not found', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const action: IAction<IActionInputs, IActionOutputs> = {
        ACTION_NAME: 'test',
        collectInput: () => ['input.key1'],
        collectOutput: () => [],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };

      const service = new TransactionService();
      service.registerModelActions([action]);
      const generator = service.beginTransaction(diffs, {}, {}, { yieldModelTransaction: true });

      await expect(async () => {
        await generator.next();
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"No matching input found to process action!"`);
    });

    it('should only process 1 matching diff', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app'), new Diff(app, DiffAction.ADD, 'name', 'app')];

      const service = new TransactionService();
      service.registerModelActions([universalModelAction]);
      const generator = service.beginTransaction(diffs, {}, {}, { yieldModelTransaction: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should call action and collect all input and output', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const action: IAction<IActionInputs, IActionOutputs> = {
        ACTION_NAME: 'test',
        collectInput: () => ['input.key1'],
        collectOutput: () => ['resource1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };
      (action.handle as jest.Mock).mockReturnValue({ resource1: 'resource1 object' });

      const service = new TransactionService();
      service.registerInputs({ 'input.key1': 'value1' });
      service.registerModelActions([action]);

      const newResources = {};
      const generator = service.beginTransaction(diffs, {}, newResources, { yieldModelTransaction: true });

      await generator.next();

      expect(action.handle).toHaveBeenCalledTimes(1);
      expect((action.handle as jest.Mock).mock.calls).toMatchSnapshot();
      expect(newResources).toMatchSnapshot();
    });

    it('should not collect action output if not specified in collectOutput()', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const action: IAction<IActionInputs, IActionOutputs> = {
        ACTION_NAME: 'test',
        collectInput: () => [],
        collectOutput: () => [],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };
      (action.handle as jest.Mock).mockReturnValue({ resource1: 'resource1 object' });

      const service = new TransactionService();
      service.registerModelActions([action]);

      const newResources = {};
      const generator = service.beginTransaction(diffs, {}, newResources, { yieldModelTransaction: true });

      await generator.next();

      expect(action.handle).toHaveBeenCalledTimes(1);
      expect(newResources).toMatchSnapshot();
    });

    it('should update diff metadata with inputs and outputs', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const action: IAction<IActionInputs, IActionOutputs> = {
        ACTION_NAME: 'test',
        collectInput: () => ['input.key1'],
        collectOutput: () => ['resource1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };
      (action.handle as jest.Mock).mockReturnValue({ resource1: 'resource1 object' });

      const service = new TransactionService();
      service.registerInputs({ 'input.key1': 'value1' });
      service.registerModelActions([action]);
      const generator = service.beginTransaction(diffs, {}, {}, { yieldModelTransaction: true });

      const result = await generator.next();

      expect((result.value as DiffMetadata[][])[0][0].inputs).toMatchSnapshot();
      expect((result.value as DiffMetadata[][])[0][0].outputs).toMatchSnapshot();
    });

    it('should call multiple actions and collect all input and output', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const action1: IAction<IActionInputs, IActionOutputs> = {
        ACTION_NAME: 'test1',
        collectInput: () => ['input.key1'],
        collectOutput: () => ['resource1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };
      (action1.handle as jest.Mock).mockReturnValue({ resource1: 'resource1 object' });
      const action2: IAction<IActionInputs, IActionOutputs> = {
        ACTION_NAME: 'test2',
        collectInput: () => ['input.key2'],
        collectOutput: () => ['resource2'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };
      (action2.handle as jest.Mock).mockReturnValue({ resource2: 'resource2 object' });

      const service = new TransactionService();
      service.registerInputs({ 'input.key1': 'value1', 'input.key2': 'value2' });
      service.registerModelActions([action1, action2]);

      const newResources = {};
      const generator = service.beginTransaction(diffs, {}, newResources, { yieldModelTransaction: true });

      await generator.next();

      expect(action1.handle).toHaveBeenCalledTimes(1);
      expect((action1.handle as jest.Mock).mock.calls).toMatchSnapshot();
      expect(action2.handle).toHaveBeenCalledTimes(1);
      expect((action2.handle as jest.Mock).mock.calls).toMatchSnapshot();
      expect(newResources).toMatchSnapshot();
    });

    it('should process diffs in different levels', async () => {
      const app = new App('app');
      const region = new Region('region');
      app.addRegion(region);
      const diffs = [
        new Diff(app, DiffAction.ADD, 'name', 'app'),
        new Diff(region, DiffAction.ADD, 'regionId', 'region'),
      ];

      const service = new TransactionService();
      service.registerModelActions([universalModelAction]);
      const generator = service.beginTransaction(diffs, {}, {}, { yieldModelTransaction: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });
  });

  describe('applyResources()', () => {
    const universalResourceAction: IResourceAction = {
      ACTION_NAME: 'universal',
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
    };

    it('should return empty transaction if diffs is empty', async () => {
      const service = new TransactionService();
      const generator = service.beginTransaction([], {}, {}, { yieldResourceTransaction: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should throw error when matching action not found', async () => {
      const oldResources: IActionOutputs = {};
      const newResources: IActionOutputs = {
        resource2: new TestResource('resource-2'),
      };

      const service = new TransactionService();
      const generator = service.beginTransaction([], oldResources, newResources, {
        yieldResourceTransaction: true,
      });

      await expect(async () => {
        await generator.next();
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"No matching action given for diff!"`);
    });

    it('should only process 1 matching diff', async () => {
      const oldResources: IActionOutputs = {};
      const newResources: IActionOutputs = {
        resource2: new TestResource('resource-2'),
      };

      const service = new TransactionService();
      service.registerResourceActions([universalResourceAction]);
      const generator = service.beginTransaction([], oldResources, newResources, {
        yieldResourceDiffs: true,
        yieldResourceTransaction: true,
      });

      const resultResourceDiffs = await generator.next();

      // Append same resource to diff.
      const duplicateDiff = new Diff(new TestResource('resource-2'), DiffAction.ADD, 'resourceId', 'resource-2');
      const duplicateDiffMetadata = new DiffMetadata(duplicateDiff, [universalResourceAction]);
      duplicateDiffMetadata.applyOrder = 0;
      (resultResourceDiffs.value as DiffMetadata[][])[0].push(duplicateDiffMetadata);

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should process diffs of adding resources per dependency graph', async () => {
      const resource1 = new TestResource('resource-1');
      const resource2 = new TestResource('resource-2');
      resource1.addChild('resourceId', resource2, 'resourceId');

      const oldResources: IActionOutputs = {};
      const newResources: IActionOutputs = {
        resource1: resource1,
        resource2: resource2,
      };

      const service = new TransactionService();
      service.registerResourceActions([universalResourceAction]);
      const generator = service.beginTransaction([], oldResources, newResources, {
        yieldResourceTransaction: true,
      });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should process diffs of deleting resources per dependency graph', async () => {
      const resource1_1 = new TestResource('resource-1');
      const resource2_1 = new TestResource('resource-2');
      resource1_1.addChild('resourceId', resource2_1, 'resourceId');
      const resource1_2 = new TestResource('resource-1');
      const resource2_2 = new TestResource('resource-2');
      resource1_2.addChild('resourceId', resource2_2, 'resourceId');

      const oldResources: IActionOutputs = {
        resource1: resource1_1,
        resource2: resource2_1,
      };
      const newResources: IActionOutputs = {
        resource1: resource1_2,
        resource2: resource2_2,
      };

      // Upon calling beginTransaction(), assume model's apply method marks the new resource as deleted.
      resource2_2.markDeleted();
      resource1_2.markDeleted();

      const service = new TransactionService();
      service.registerResourceActions([universalResourceAction]);
      const generator = service.beginTransaction([], oldResources, newResources, {
        yieldResourceTransaction: true,
      });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });
  });

  describe('diffResources()', () => {
    const universalResourceAction: IResourceAction = {
      ACTION_NAME: 'universal',
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
    };

    it('should compare distinct resources', async () => {
      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      newResources.resource1.markDeleted();

      const service = new TransactionService();
      service.registerResourceActions([universalResourceAction]);
      const generator = service.beginTransaction([], oldResources, newResources, { yieldResourceDiffs: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should compare same resources', async () => {
      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };

      const service = new TransactionService();
      service.registerResourceActions([universalResourceAction]);
      const generator = service.beginTransaction([], oldResources, newResources, { yieldResourceDiffs: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should compare same resources with delete marker on new', async () => {
      const newTestResource = new TestResource('resource-1');
      newTestResource.markDeleted();

      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {
        resource1: newTestResource,
      };

      const service = new TransactionService();
      service.registerResourceActions([universalResourceAction]);
      const generator = service.beginTransaction([], oldResources, newResources, { yieldResourceDiffs: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should compare same resources with replace marker on new', async () => {
      const newTestResource = new TestResource('resource-1');
      newTestResource.markReplaced();

      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {
        resource1: newTestResource,
      };

      const service = new TransactionService();
      service.registerResourceActions([universalResourceAction]);
      const generator = service.beginTransaction([], oldResources, newResources, { yieldResourceDiffs: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should compare same resources with update marker on new', async () => {
      const newTestResource = new TestResource('resource-1');
      newTestResource.markUpdated('updateKey', 'update value');

      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {
        resource1: newTestResource,
      };

      const service = new TransactionService();
      service.registerResourceActions([universalResourceAction]);
      const generator = service.beginTransaction([], oldResources, newResources, { yieldResourceDiffs: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    describe('When resource class has an override on diff()', () => {
      it('should compare same resources on properties', async () => {
        const oldResources: IActionOutputs = {
          resource1: new TestResource('resource-1'),
        };
        const newResources: IActionOutputs = {
          resource1: new TestResourceWithDiffOverride('resource-1'),
        };

        const service = new TransactionService();
        service.registerResourceActions([universalResourceAction]);
        const generator = service.beginTransaction([], oldResources, newResources, { yieldResourceDiffs: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });
  });

  describe('setApplyOrder()', () => {
    const actions: IAction<IActionInputs, IActionOutputs>[] = [
      {
        ACTION_NAME: 'test',
        collectInput: () => [],
        collectOutput: () => [],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      },
    ];
    let setApplyOrder: TransactionService['setApplyOrder'];

    beforeEach(() => {
      const service = new TransactionService();
      setApplyOrder = service['setApplyOrder'];
      setApplyOrder = setApplyOrder.bind(service);
    });

    it('should not set order for diff that already has an order defined', () => {
      const app = new App('test');
      const region = new Region('region-1');
      const environment = new Environment('qa');
      app.addRegion(region);
      region.addEnvironment(environment);
      const diff = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diffMetadata = new DiffMetadata(diff, actions);
      diffMetadata.applyOrder = 1;

      expect(diffMetadata.applyOrder).toBe(1);
      setApplyOrder(diffMetadata, [diffMetadata]);
      expect(diffMetadata.applyOrder).toBe(1);
    });

    it('should set order 0 for diff with no dependencies', () => {
      const app = new App('test');
      const region = new Region('region-1');
      const environment = new Environment('qa');
      app.addRegion(region);
      region.addEnvironment(environment);
      const diff = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diffMetadata = new DiffMetadata(diff, actions);

      expect(diffMetadata.applyOrder).toBe(-1);
      setApplyOrder(diffMetadata, [diffMetadata]);
      expect(diffMetadata.applyOrder).toBe(0);
    });

    it('should set order 0 for diff with dependencies not in current array of diffs', () => {
      const app = new App('test');
      const region = new Region('region-1');
      const environment = new Environment('qa');
      app.addRegion(region);
      region.addEnvironment(environment);
      const diff = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diffMetadata = new DiffMetadata(diff, actions);

      expect(diffMetadata.applyOrder).toBe(-1);
      setApplyOrder(diffMetadata, [diffMetadata]);
      expect(diffMetadata.applyOrder).toBe(0);
    });

    it('should only set order for the diff and its dependencies', () => {
      const app = new App('test');
      const region1 = new Region('region-1');
      const region2 = new Region('region-2');
      const environment = new Environment('qa');
      app.addRegion(region1);
      app.addRegion(region2);
      region1.addEnvironment(environment);

      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(region1, DiffAction.ADD, 'regionId', 'region-1');
      const diff3 = new Diff(region2, DiffAction.ADD, 'regionId', 'region-2');

      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, actions));

      setApplyOrder(diffsMetadata[0], diffsMetadata);

      expect(diffsMetadata[0].applyOrder).toBe(1);
      expect(diffsMetadata[1].applyOrder).toBe(0);
      expect(diffsMetadata[2].applyOrder).toBe(-1);
    });

    it('should set order 1 for diff with 1 level of dependencies', () => {
      const app = new App('test');
      const region = new Region('region-1');
      const environment = new Environment('qa');
      app.addRegion(region);
      region.addEnvironment(environment);
      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(region, DiffAction.ADD, 'regionId', 'region-1');

      const diffsMetadata = [diff1, diff2].map((d) => new DiffMetadata(d, actions));

      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      setApplyOrder(diffsMetadata[0], diffsMetadata);
      expect(diffsMetadata[0].applyOrder).toBe(1);
      expect(diffsMetadata[1].applyOrder).toBe(0);
    });

    it('should set order 2 for diff with 2 level of dependencies', () => {
      const app = new App('test');
      const region = new Region('region-1');
      const environment = new Environment('qa');
      app.addRegion(region);
      region.addEnvironment(environment);
      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(region, DiffAction.ADD, 'regionId', 'region-1');
      const diff3 = new Diff(app, DiffAction.ADD, 'name', 'test');

      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, actions));

      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      expect(diffsMetadata[2].applyOrder).toBe(-1);
      setApplyOrder(diffsMetadata[0], diffsMetadata);
      expect(diffsMetadata[0].applyOrder).toBe(2);
      expect(diffsMetadata[1].applyOrder).toBe(1);
      expect(diffsMetadata[2].applyOrder).toBe(0);
    });

    it('should throw errors with 1 level of circular dependencies', () => {
      const app = new App('test');
      const region = new Region('region-1');
      const diff1 = new Diff(region, DiffAction.ADD, 'regionId', 'region-1');
      const diff2 = new Diff(app, DiffAction.ADD, 'name', 'test');

      const diffsMetadata = [diff1, diff2].map((d) => new DiffMetadata(d, actions));

      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      expect(() => {
        app.addRegion(region);
        region.addChild('regionId', app, 'name');
        setApplyOrder(diffsMetadata[0], diffsMetadata);
      }).toThrowError('Found circular dependencies!');
      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
    });

    it('should throw errors with 2 level of circular dependencies', () => {
      const app = new App('test');
      const region = new Region('region-1');
      const environment = new Environment('qa');
      app.addRegion(region);
      region.addEnvironment(environment);
      environment.addChild('environmentName', app, 'name');
      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(region, DiffAction.ADD, 'regionId', 'region-1');
      const diff3 = new Diff(app, DiffAction.ADD, 'name', 'test');

      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, actions));

      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      expect(diffsMetadata[2].applyOrder).toBe(-1);
      expect(() => {
        setApplyOrder(diffsMetadata[0], diffsMetadata);
      }).toThrowError('Found circular dependencies!');
      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      expect(diffsMetadata[2].applyOrder).toBe(-1);
    });

    it('should throw errors add and update of model are in same transaction', () => {
      const app = new App('app');
      const region = new Region('region');
      app.addRegion(region);
      const environment = new Environment('env');
      region.addEnvironment(environment);

      const diff1 = new Diff(region, DiffAction.ADD, 'regionId', 'region');
      const diff2 = new Diff(environment, DiffAction.ADD, 'environmentName', 'env');
      const diff3 = new Diff(environment, DiffAction.UPDATE, 'environmentVariables', '{}');
      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, actions));

      expect(() => {
        setApplyOrder(diffsMetadata[0], diffsMetadata);
        setApplyOrder(diffsMetadata[1], diffsMetadata);
        setApplyOrder(diffsMetadata[2], diffsMetadata);
      }).toThrowError('Found conflicting actions in same transaction!');
    });
  });

  describe('beginTransaction()', () => {
    describe('yieldNewResources', () => {
      const universalResourceAction: IResourceAction = {
        ACTION_NAME: 'universal',
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };

      it('should yield new resources', async () => {
        const oldResources: IActionOutputs = {
          resource1: new TestResource('resource-1'),
        };
        const newResources: IActionOutputs = {
          resource1: new TestResource('resource-1'),
          resource2: new TestResource('resource-2'),
        };

        const service = new TransactionService();
        service.registerResourceActions([universalResourceAction]);
        const generator = service.beginTransaction([], oldResources, newResources, { yieldNewResources: true });

        const result = await generator.next();

        expect(result.value.map((r) => r.resourceId)).toMatchInlineSnapshot(`
          [
            "resource-1",
            "resource-2",
          ]
        `);
      });
    });
  });

  describe('rollbackTransaction()', () => {
    const universalModelAction: IAction<IActionInputs, IActionOutputs> = {
      ACTION_NAME: 'universal',
      collectInput: () => [],
      collectOutput: () => [],
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
      revert: jest.fn() as jest.Mocked<any>,
    };

    it('should call revert() for every diff in transaction', async () => {
      (universalModelAction.revert as jest.Mock).mockReturnValue({});

      const diffs = [new Diff(new App('app'), DiffAction.ADD, 'name', 'app')];

      const service = new TransactionService();
      service.registerModelActions([universalModelAction]);

      const transactionGenerator = service.beginTransaction(diffs, {}, {}, { yieldModelTransaction: true });
      const transactionResult = await transactionGenerator.next();
      const modelTransaction = transactionResult.value as DiffMetadata[][];

      const generator = service.rollbackTransaction(modelTransaction, {}, {}, {});
      await generator.next();

      expect(universalModelAction.revert).toHaveBeenCalledTimes(1);
      expect((universalModelAction.revert as jest.Mock).mock.calls).toMatchSnapshot();
    });

    it('should be able to revert addition of resources', async () => {
      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
        resource2: new TestResource('resource-2'),
      };

      // Upon calling rollbackTransaction(), assume model's revert method marks the new resource as deleted.
      oldResources['resource2'] = new TestResource('resource-2');
      oldResources['resource2'].markDeleted();

      const service = new TransactionService();
      service.registerResourceActions([
        {
          ACTION_NAME: 'test',
          filter: (): boolean => true,
          handle: jest.fn() as jest.Mocked<any>,
        },
      ]);

      const generator = service.rollbackTransaction([], oldResources, newResources, { yieldResourceTransaction: true });
      const result = await generator.next();

      // Notice the results are in reverse order, i.e. on revert new resources are reverted.
      expect(result.value).toMatchSnapshot();
    });

    it('should be able to revert deletion of resources', async () => {
      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {};

      const service = new TransactionService();
      service.registerResourceActions([
        {
          ACTION_NAME: 'test',
          filter: (): boolean => true,
          handle: jest.fn() as jest.Mocked<any>,
        },
      ]);

      const generator = service.rollbackTransaction([], oldResources, newResources, { yieldResourceDiffs: true });
      const result = await generator.next();

      // Notice the results are in reverse order, i.e. on revert new resources are reverted.
      expect(result.value).toMatchSnapshot();
    });
  });
});
