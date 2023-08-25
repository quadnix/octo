import { DiffMetadata } from '../../functions/diff/diff-metadata.model';
import { Diff, DiffAction } from '../../functions/diff/diff.model';
import { IAction, IActionInputs, IActionOutputs } from '../../models/action.interface';
import { App } from '../../models/app/app.model';
import { Environment } from '../../models/environment/environment.model';
import { Region } from '../../models/region/region.model';
import { IResourceAction } from '../../resources/resource-action.interface';
import { Resource } from '../../resources/resource.abstract';
import { TransactionService } from './transaction.service';

class TestResource extends Resource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string) {
    super(resourceId);
  }
}

class TestResourceWithDiffOverride extends Resource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string) {
    super(resourceId);
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
    const universalAction: IAction<IActionInputs, IActionOutputs> = {
      ACTION_NAME: 'universal',
      collectInput: () => [],
      collectOutput: () => [],
      filter: () => true,
      handle: jest.fn(),
      revert: jest.fn(),
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
        handle: jest.fn(),
        revert: jest.fn(),
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
      service.registerModelActions([universalAction]);
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
        handle: jest.fn(),
        revert: jest.fn(),
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
        handle: jest.fn(),
        revert: jest.fn(),
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
        handle: jest.fn(),
        revert: jest.fn(),
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
        ACTION_NAME: 'test',
        collectInput: () => ['input.key1'],
        collectOutput: () => ['resource1'],
        filter: () => true,
        handle: jest.fn(),
        revert: jest.fn(),
      };
      (action1.handle as jest.Mock).mockReturnValue({ resource1: 'resource1 object' });
      const action2: IAction<IActionInputs, IActionOutputs> = {
        ACTION_NAME: 'test',
        collectInput: () => ['input.key2'],
        collectOutput: () => ['resource2'],
        filter: () => true,
        handle: jest.fn(),
        revert: jest.fn(),
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
      service.registerModelActions([universalAction]);
      const generator = service.beginTransaction(diffs, {}, {}, { yieldModelTransaction: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });
  });

  describe('applyResources()', () => {
    const universalAction: IResourceAction = {
      ACTION_NAME: 'universal',
      filter: () => true,
      handle: jest.fn(),
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
      service.registerResourceActions([universalAction]);
      const generator = service.beginTransaction([], oldResources, newResources, {
        yieldResourceDiffs: true,
        yieldResourceTransaction: true,
      });

      const resultResourceDiffs = await generator.next();
      // Append same resource to diff.
      (resultResourceDiffs.value as Diff[]).push(
        new Diff(new TestResource('resource-2'), DiffAction.ADD, 'resourceId', 'resource-2'),
      );

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should process diffs in different levels', async () => {
      const resource1 = new TestResource('resource-1');
      const resource2 = new TestResource('resource-2');
      resource1.addChild('resourceId', resource2, 'resourceId');

      const oldResources: IActionOutputs = {};
      const newResources: IActionOutputs = {
        resource1: resource1,
        resource2: resource2,
      };

      const service = new TransactionService();
      service.registerResourceActions([universalAction]);
      const generator = service.beginTransaction([], oldResources, newResources, {
        yieldResourceTransaction: true,
      });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });
  });

  describe('diffResources()', () => {
    it('should compare distinct resources', async () => {
      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {
        resource2: new TestResource('resource-2'),
      };

      const service = new TransactionService();
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
      const generator = service.beginTransaction([], oldResources, newResources, { yieldResourceDiffs: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should compare same resources with delete marker on new', async () => {
      const newTestResource = new TestResource('resource-1');
      newTestResource.diffMarkers.delete = true;

      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {
        resource1: newTestResource,
      };

      const service = new TransactionService();
      const generator = service.beginTransaction([], oldResources, newResources, { yieldResourceDiffs: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should compare same resources with replace marker on new', async () => {
      const newTestResource = new TestResource('resource-1');
      newTestResource.diffMarkers.replace = true;

      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {
        resource1: newTestResource,
      };

      const service = new TransactionService();
      const generator = service.beginTransaction([], oldResources, newResources, { yieldResourceDiffs: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should compare same resources with update marker on new', async () => {
      const newTestResource = new TestResource('resource-1');
      newTestResource.diffMarkers.update = { key: 'updateKey', value: 'update value' };

      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {
        resource1: newTestResource,
      };

      const service = new TransactionService();
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
        handle: jest.fn(),
        revert: jest.fn(),
      },
    ];
    let setApplyOrder: TransactionService['setApplyOrder'];

    beforeEach(() => {
      const service = new TransactionService();
      setApplyOrder = service['setApplyOrder'];
      setApplyOrder = setApplyOrder.bind(service);
    });

    it('should not set order for diff that already has an order defined', () => {
      const environment = new Environment('qa');
      const diff = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diffMetadata = new DiffMetadata(diff, actions);
      diffMetadata.applyOrder = 1;

      expect(diffMetadata.applyOrder).toBe(1);
      setApplyOrder(diffMetadata, [diffMetadata]);
      expect(diffMetadata.applyOrder).toBe(1);
    });

    it('should set order 0 for diff with no dependencies', () => {
      const environment = new Environment('qa');
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
  });

  describe('rollbackTransaction()', () => {
    const universalAction: IAction<IActionInputs, IActionOutputs> = {
      ACTION_NAME: 'universal',
      collectInput: () => [],
      collectOutput: () => [],
      filter: () => true,
      handle: jest.fn(),
      revert: jest.fn(),
    };

    it('should call revert() for every diff in transaction', async () => {
      (universalAction.revert as jest.Mock).mockReturnValue({});

      const diffs = [new Diff(new App('app'), DiffAction.ADD, 'name', 'app')];

      const service = new TransactionService();
      service.registerModelActions([universalAction]);

      const transactionGenerator = service.beginTransaction(diffs, {}, {}, { yieldModelTransaction: true });
      const transactionResult = await transactionGenerator.next();
      const modelTransaction = transactionResult.value as DiffMetadata[][];

      const generator = service.rollbackTransaction(modelTransaction, {}, {}, {});
      await generator.next();

      expect(universalAction.revert).toHaveBeenCalledTimes(1);
      expect((universalAction.revert as jest.Mock).mock.calls).toMatchSnapshot();
    });

    it('should calculate diff of resources', async () => {
      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {
        resource2: new TestResource('resource-2'),
      };

      const service = new TransactionService();
      const generator = service.rollbackTransaction([], oldResources, newResources, { yieldResourceDiffs: true });
      const result = await generator.next();

      // Notice the results are in reverse order, i.e. on revert new resources are reverted.
      expect(result.value).toMatchSnapshot();
    });

    it('should apply all diff output on resources', async () => {
      const oldResources: IActionOutputs = {
        resource1: new TestResource('resource-1'),
      };
      const newResources: IActionOutputs = {
        resource2: new TestResource('resource-2'),
      };

      const service = new TransactionService();
      service.registerResourceActions([
        {
          ACTION_NAME: 'test',
          filter: (): boolean => true,
          handle: jest.fn(),
        },
      ]);

      const generator = service.rollbackTransaction([], oldResources, newResources, { yieldResourceTransaction: true });
      const result = await generator.next();

      // Notice the results are in reverse order, i.e. on revert new resources are reverted.
      expect(result.value).toMatchSnapshot();
    });
  });
});
