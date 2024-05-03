import { jest } from '@jest/globals';
import { SharedTestResource, TestAnchor, TestOverlay, TestResource } from '../../../test/helpers/test-classes.js';
import { UnknownResource } from '../../app.type.js';
import { Container } from '../../decorators/container.js';
import { DiffMetadata } from '../../functions/diff/diff-metadata.js';
import { Diff, DiffAction } from '../../functions/diff/diff.js';
import { IModelAction } from '../../models/model-action.interface.js';
import { App } from '../../models/app/app.model.js';
import { Environment } from '../../models/environment/environment.model.js';
import { Region } from '../../models/region/region.model.js';
import { OverlayDataRepository, OverlayDataRepositoryFactory } from '../../overlays/overlay-data.repository.js';
import { IResourceAction } from '../../resources/resource-action.interface.js';
import { ResourceDataRepository, ResourceDataRepositoryFactory } from '../../resources/resource-data.repository.js';
import { InputService, InputServiceFactory } from '../input/input.service.js';
import { TransactionService, TransactionServiceFactory } from './transaction.service.js';

describe('TransactionService UT', () => {
  beforeEach(() => {
    Container.registerFactory(InputService, InputServiceFactory);

    Container.registerFactory(OverlayDataRepository, OverlayDataRepositoryFactory);
    Container.get(OverlayDataRepository, { args: [true, [], []] });

    Container.registerFactory(ResourceDataRepository, ResourceDataRepositoryFactory);
    Container.get(ResourceDataRepository, { args: [true] });

    Container.registerFactory(TransactionService, TransactionServiceFactory);
    Container.get(TransactionService, { args: [true] });
  });

  afterEach(() => {
    Container.reset();

    jest.restoreAllMocks();
  });

  describe('applyModels()', () => {
    const universalModelAction: IModelAction = {
      ACTION_NAME: 'universal',
      collectInput: () => [],
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
      revert: jest.fn() as jest.Mocked<any>,
    };

    it('should return empty transaction if diffs is empty', async () => {
      const service = await Container.get(TransactionService);
      const generator = service.beginTransaction([], { yieldModelTransaction: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should throw error when matching action not found', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const service = await Container.get(TransactionService);
      const generator = service.beginTransaction(diffs, { yieldModelTransaction: true });

      await expect(async () => {
        await generator.next();
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"No matching action given for diff!"`);
    });

    it('should throw error when action inputs are not found', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const modelAction: IModelAction = {
        ACTION_NAME: 'test',
        collectInput: () => ['input.key1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };

      const service = await Container.get(TransactionService);
      service.registerModelActions([modelAction]);
      const generator = service.beginTransaction(diffs, { yieldModelTransaction: true });

      await expect(async () => {
        await generator.next();
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"No matching input found to process action!"`);
    });

    it('should throw error when action resource inputs are not found', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const modelAction: IModelAction = {
        ACTION_NAME: 'test',
        collectInput: () => ['resource.key1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };

      const service = await Container.get(TransactionService);
      service.registerModelActions([modelAction]);
      const generator = service.beginTransaction(diffs, { yieldModelTransaction: true });

      await expect(async () => {
        await generator.next();
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"No matching input found to process action!"`);
    });

    it('should skip processing diffs that are already applied', async () => {
      const app = new App('app');

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [universalModelAction]);
      diffMetadata.applied = true;
      diffMetadata.applyOrder = 0;

      const service = await Container.get(TransactionService);
      const result = await service['applyModels']([diffMetadata]);

      expect(result).toMatchSnapshot();
    });

    it('should only process 1 matching diff when duplicates found', async () => {
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app'), new Diff(app, DiffAction.ADD, 'name', 'app')];

      const service = await Container.get(TransactionService);
      service.registerModelActions([universalModelAction]);
      const generator = service.beginTransaction(diffs, { yieldModelTransaction: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should call action and collect all input and output', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const modelAction: IModelAction = {
        ACTION_NAME: 'test',
        collectInput: () => ['input.key1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };
      (modelAction.handle as jest.Mocked<any>).mockResolvedValue({
        resource1: new TestResource('resource1'),
      });

      const inputService = await Container.get(InputService);
      inputService.registerInputs({ 'input.key1': 'value1' });
      const service = await Container.get(TransactionService);
      service.registerModelActions([modelAction]);

      const generator = service.beginTransaction(diffs, { yieldNewResources: true });

      const newResources = await generator.next();

      expect(modelAction.handle).toHaveBeenCalledTimes(1);
      expect((modelAction.handle as jest.Mock).mock.calls).toMatchSnapshot();
      expect(newResources.value.map((r) => r.resourceId)).toMatchSnapshot();
    });

    it('should update diff metadata with inputs and outputs', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const modelAction: IModelAction = {
        ACTION_NAME: 'test',
        collectInput: () => ['input.key1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };
      (modelAction.handle as jest.Mocked<any>).mockResolvedValue({ resource1: new TestResource('resource1') });

      const inputService = await Container.get(InputService);
      inputService.registerInputs({ 'input.key1': 'value1' });
      const service = await Container.get(TransactionService);
      service.registerModelActions([modelAction]);
      const generator = service.beginTransaction(diffs, { yieldModelTransaction: true });

      const result = await generator.next();

      expect((result.value as DiffMetadata[][])[0][0].inputs).toMatchSnapshot();
      expect((result.value as DiffMetadata[][])[0][0].outputs['resource1'].resourceId).toMatchSnapshot();
    });

    it('should call multiple actions and collect all input and output', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const modelAction1: IModelAction = {
        ACTION_NAME: 'test1',
        collectInput: () => ['input.key1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };
      (modelAction1.handle as jest.Mocked<any>).mockResolvedValue({ resource1: new TestResource('resource1') });
      const modelAction2: IModelAction = {
        ACTION_NAME: 'test2',
        collectInput: () => ['input.key2'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };
      (modelAction2.handle as jest.Mocked<any>).mockResolvedValue({ resource2: new TestResource('resource2') });

      const inputService = await Container.get(InputService);
      inputService.registerInputs({ 'input.key1': 'value1', 'input.key2': 'value2' });
      const service = await Container.get(TransactionService);
      service.registerModelActions([modelAction1, modelAction2]);

      const generator = service.beginTransaction(diffs, { yieldNewResources: true });

      const newResources = await generator.next();

      expect(modelAction1.handle).toHaveBeenCalledTimes(1);
      expect((modelAction1.handle as jest.Mock).mock.calls).toMatchSnapshot();
      expect(modelAction2.handle).toHaveBeenCalledTimes(1);
      expect((modelAction2.handle as jest.Mock).mock.calls).toMatchSnapshot();
      expect(newResources.value.map((r) => r.resourceId)).toMatchSnapshot();
    });

    it('should process diffs in different levels', async () => {
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

      const app = new App('app');
      const region = new Region('region');
      app.addRegion(region);
      const diffs = [
        new Diff(app, DiffAction.ADD, 'name', 'app'),
        new Diff(region, DiffAction.ADD, 'regionId', 'region'),
      ];

      const service = await Container.get(TransactionService);
      service.registerModelActions([universalModelAction]);
      const generator = service.beginTransaction(diffs, { yieldModelTransaction: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should add the shared-resource to set of resources if it does not exist', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({
        resource1: new SharedTestResource('shared-resource', { key1: 'value-1' }, []),
      });

      const service = await Container.get(TransactionService);
      service.registerModelActions([universalModelAction]);

      const generator = service.beginTransaction(diffs, { yieldNewResources: true });

      const newResources = await generator.next();

      expect(newResources.value.map((r) => r.resourceId)).toMatchSnapshot();
    });

    it('should merge the shared-resource with existing set of resources', async () => {
      const app = new App('app');
      const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

      const sharedResource1 = new SharedTestResource('shared-resource', { key1: 'value-1' }, []);
      await Container.get(ResourceDataRepository, { args: [true, [sharedResource1], [sharedResource1]] });

      const sharedResource2 = new SharedTestResource('shared-resource', { key2: 'value-2' }, []);
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({ 'shared-resource': sharedResource2 });
      const mergeFunction = jest.spyOn(sharedResource2, 'merge');

      const service = await Container.get(TransactionService, { args: [true] });
      service.registerModelActions([universalModelAction]);

      const generator = service.beginTransaction(diffs, { yieldNewResources: true });

      const newResources = await generator.next();

      expect(newResources.value.map((r) => r.resourceId)).toMatchSnapshot();
      expect(mergeFunction).toHaveBeenCalledTimes(1);

      const mergeFunctionArg0 = mergeFunction.mock.calls[0][0] as UnknownResource;
      expect(mergeFunctionArg0.properties).toEqual({ key1: 'value-1' });
    });
  });

  describe('applyResources()', () => {
    const universalResourceAction: IResourceAction = {
      ACTION_NAME: 'universal',
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
    };

    it('should return empty transaction if diffs is empty', async () => {
      const service = await Container.get(TransactionService);
      const generator = service.beginTransaction([], { yieldResourceTransaction: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should throw error when matching action not found', async () => {
      const resources = [new TestResource('resource-1')];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], []] });

      const service = await Container.get(TransactionService, { args: [true] });
      const generator = service.beginTransaction([], { yieldResourceTransaction: true });

      await expect(async () => {
        await generator.next();
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"No matching action given for diff!"`);
    });

    it('should skip processing diffs that are already applied', async () => {
      const resource1 = new TestResource('resource-1');
      const diff = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
      const diffMetadata = new DiffMetadata(diff, [universalResourceAction]);
      diffMetadata.applied = true;
      diffMetadata.applyOrder = 0;

      const service = await Container.get(TransactionService);
      const result = await service['applyResources']([diffMetadata]);

      expect(result).toMatchSnapshot();
    });

    it('should only process 1 matching diff when duplicates found', async () => {
      const resources = [new TestResource('resource-1')];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], [...resources]] });

      const service = await Container.get(TransactionService, { args: [true] });
      service.registerResourceActions([universalResourceAction]);
      const generator = service.beginTransaction([], { yieldResourceDiffs: true, yieldResourceTransaction: true });

      const resultResourceDiffs = await generator.next();

      // Append same resource to diff.
      const duplicateDiff = new Diff(new TestResource('resource-1'), DiffAction.ADD, 'resourceId', 'resource-1');
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

      const resources = [resource1, resource2];
      await Container.get(ResourceDataRepository, { args: [true, [...resources], []] });

      const service = await Container.get(TransactionService, { args: [true] });
      service.registerResourceActions([universalResourceAction]);
      const generator = service.beginTransaction([], { yieldResourceTransaction: true });

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

      await Container.get(ResourceDataRepository, {
        args: [true, [resource1_2, resource2_2], [resource1_1, resource2_1]],
      });

      // Upon calling beginTransaction(), assume model's apply method marks the new resource as deleted.
      resource2_2.markDeleted();
      resource1_2.markDeleted();

      const service = await Container.get(TransactionService, { args: [true] });
      service.registerResourceActions([universalResourceAction]);
      const generator = service.beginTransaction([], { yieldResourceTransaction: true });

      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });
  });

  describe('setApplyOrder()', () => {
    const modelActions: IModelAction[] = [
      {
        ACTION_NAME: 'test',
        collectInput: () => [],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      },
    ];
    let setApplyOrder: TransactionService['setApplyOrder'];

    beforeEach(async () => {
      const service = await Container.get(TransactionService);
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
      const diffMetadata = new DiffMetadata(diff, modelActions);
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
      const diffMetadata = new DiffMetadata(diff, modelActions);

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
      const diffMetadata = new DiffMetadata(diff, modelActions);

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

      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, modelActions));

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

      const diffsMetadata = [diff1, diff2].map((d) => new DiffMetadata(d, modelActions));

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

      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, modelActions));

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

      const diffsMetadata = [diff1, diff2].map((d) => new DiffMetadata(d, modelActions));

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

      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, modelActions));

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
      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, modelActions));

      expect(() => {
        setApplyOrder(diffsMetadata[0], diffsMetadata);
        setApplyOrder(diffsMetadata[1], diffsMetadata);
        setApplyOrder(diffsMetadata[2], diffsMetadata);
      }).toThrowError('Found conflicting actions in same transaction!');
    });
  });

  describe('beginTransaction()', () => {
    describe('yieldModelTransaction', () => {
      const universalModelAction: IModelAction = {
        ACTION_NAME: 'universal',
        collectInput: () => [],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };

      it('should yield model transaction', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const app = new App('app');
        const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

        const service = await Container.get(TransactionService);
        service.registerModelActions([universalModelAction]);
        const generator = service.beginTransaction(diffs, { yieldModelTransaction: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });

      it('should yield model transaction with overlays', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const app = new App('app');
        const anchor = new TestAnchor('test-anchor', app);
        const overlay = new TestOverlay('test-overlay', {}, [anchor]);

        const overlayDataRepository = await Container.get(OverlayDataRepository);
        overlayDataRepository.add(overlay);

        const service = await Container.get(TransactionService);
        service.registerOverlayActions([universalModelAction]);
        const generator = service.beginTransaction([], { yieldModelTransaction: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });

    describe('yieldNewResources', () => {
      const universalResourceAction: IResourceAction = {
        ACTION_NAME: 'universal',
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };

      it('should yield new resources', async () => {
        const oldResource = new TestResource('resource-1');
        const newResource = new TestResource('resource-2');

        const resourceDataRepository = await Container.get(ResourceDataRepository, { args: [true, [], [oldResource]] });
        resourceDataRepository.add(newResource);

        const service = await Container.get(TransactionService, { args: [true] });
        service.registerResourceActions([universalResourceAction]);
        const generator = service.beginTransaction([], { yieldNewResources: true });

        const result = await generator.next();

        expect(result.value.map((r) => r.resourceId)).toEqual(['resource-2']);
      });
    });

    describe('yieldResourceDiffs', () => {
      const universalModelAction: IModelAction = {
        ACTION_NAME: 'universal',
        collectInput: () => [],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };
      const universalResourceAction: IResourceAction = {
        ACTION_NAME: 'universal',
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };

      it('should yield resource diffs', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const app = new App('app');
        const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

        const oldResource = new TestResource('resource-1');
        const newResource = new TestResource('resource-2');

        const resourceDataRepository = await Container.get(ResourceDataRepository, { args: [true, [], [oldResource]] });
        resourceDataRepository.add(newResource);

        const service = await Container.get(TransactionService, { args: [true] });
        service.registerModelActions([universalModelAction]);
        service.registerResourceActions([universalResourceAction]);
        const generator = service.beginTransaction(diffs, { yieldResourceDiffs: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });

    describe('yieldResourceTransaction', () => {
      const universalModelAction: IModelAction = {
        ACTION_NAME: 'universal',
        collectInput: () => [],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };
      const universalResourceAction: IResourceAction = {
        ACTION_NAME: 'universal',
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };

      it('should yield resource diffs', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});
        (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const app = new App('app');
        const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

        const oldResource = new TestResource('resource-1');
        const newResource = new TestResource('resource-2');

        const resourceDataRepository = await Container.get(ResourceDataRepository, { args: [true, [], [oldResource]] });
        resourceDataRepository.add(newResource);

        const service = await Container.get(TransactionService, { args: [true] });
        service.registerModelActions([universalModelAction]);
        service.registerResourceActions([universalResourceAction]);
        const generator = service.beginTransaction(diffs, { yieldResourceTransaction: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });

      it('should return model diffs', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});
        (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const app = new App('app');
        const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

        const oldResource = new TestResource('resource-1');
        const newResource = new TestResource('resource-2');

        const resourceDataRepository = await Container.get(ResourceDataRepository, { args: [true, [], [oldResource]] });
        resourceDataRepository.add(newResource);

        const service = await Container.get(TransactionService, { args: [true] });
        service.registerModelActions([universalModelAction]);
        service.registerResourceActions([universalResourceAction]);
        const generator = service.beginTransaction(diffs);

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });
  });

  describe('rollbackTransaction()', () => {
    const universalModelAction: IModelAction = {
      ACTION_NAME: 'universal',
      collectInput: () => [],
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
      revert: jest.fn() as jest.Mocked<any>,
    };

    it('should call revert() for every diff in transaction', async () => {
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});
      (universalModelAction.revert as jest.Mocked<any>).mockResolvedValue({});

      const diffs = [new Diff(new App('app'), DiffAction.ADD, 'name', 'app')];

      const service = await Container.get(TransactionService);
      service.registerModelActions([universalModelAction]);

      const transactionGenerator = service.beginTransaction(diffs, { yieldModelTransaction: true });
      const transactionResult = await transactionGenerator.next();
      const modelTransaction = transactionResult.value as DiffMetadata[][];

      const generator = service.rollbackTransaction(modelTransaction);
      await generator.next();

      expect(universalModelAction.revert).toHaveBeenCalledTimes(1);
      expect((universalModelAction.revert as jest.Mock).mock.calls).toMatchSnapshot();
    });

    it('should be able to revert addition of resources', async () => {
      // Assume "newResource" has been recently added. Upon revert, the new state should have this resource deleted.
      const newResource = new TestResource('resource-1');

      const resourceDataRepository = await Container.get(ResourceDataRepository, {
        args: [true, [newResource], [newResource]],
      });

      // Upon calling rollbackTransaction(), assume model's revert method marks the new resource as deleted.
      resourceDataRepository.getById('resource-1')!.markDeleted();

      const service = await Container.get(TransactionService, { args: [true] });
      service.registerResourceActions([
        {
          ACTION_NAME: 'test',
          filter: (): boolean => true,
          handle: jest.fn() as jest.Mocked<any>,
        },
      ]);

      const generator = service.rollbackTransaction([], { yieldResourceTransaction: true });
      const result = await generator.next();

      // Notice the results are in reverse order, i.e. on revert new resources are reverted.
      expect(result.value).toMatchSnapshot();
    });

    it('should be able to revert deletion of resources', async () => {
      // Assume "oldResource" has been recently deleted. Upon revert, the new state should have this resource added.
      const oldResource = new TestResource('resource-1');

      const resourceDataRepository = await Container.get(ResourceDataRepository, { args: [true, [], []] });

      // Upon calling rollbackTransaction(), assume model's revert method adds the new resource again.
      resourceDataRepository.add(oldResource);

      const service = await Container.get(TransactionService, { args: [true] });
      service.registerResourceActions([
        {
          ACTION_NAME: 'test',
          filter: (): boolean => true,
          handle: jest.fn() as jest.Mocked<any>,
        },
      ]);

      const generator = service.rollbackTransaction([], { yieldResourceDiffs: true });
      const result = await generator.next();

      // Notice the results are in reverse order, i.e. on revert new resources are reverted.
      expect(result.value).toMatchSnapshot();
    });
  });
});
