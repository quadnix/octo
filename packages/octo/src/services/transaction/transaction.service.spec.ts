import { jest } from '@jest/globals';
import { SharedTestResource, TestAnchor, TestResource } from '../../../test/helpers/test-classes.js';
import { commitResources, create, createTestOverlays, createTestResources } from '../../../test/helpers/test-models.js';
import { Container } from '../../decorators/container.js';
import { DiffMetadata } from '../../functions/diff/diff-metadata.js';
import { Diff, DiffAction } from '../../functions/diff/diff.js';
import { type IModelAction } from '../../models/model-action.interface.js';
import { App } from '../../models/app/app.model.js';
import { Region } from '../../models/region/region.model.js';
import { OverlayDataRepository, OverlayDataRepositoryFactory } from '../../overlays/overlay-data.repository.js';
import { OverlayService, OverlayServiceFactory } from '../../overlays/overlay.service.js';
import { type IResourceAction } from '../../resources/resource-action.interface.js';
import { ResourceDataRepository, ResourceDataRepositoryFactory } from '../../resources/resource-data.repository.js';
import { CaptureService, CaptureServiceFactory } from '../capture/capture.service.js';
import { InputService, InputServiceFactory } from '../input/input.service.js';
import {
  ResourceSerializationService,
  ResourceSerializationServiceFactory,
} from '../serialization/resource/resource-serialization.service.js';
import { TransactionService, TransactionServiceFactory } from './transaction.service.js';

describe('TransactionService UT', () => {
  beforeEach(async () => {
    Container.registerFactory(CaptureService, CaptureServiceFactory);
    Container.registerFactory(InputService, InputServiceFactory);

    Container.registerFactory(OverlayDataRepository, OverlayDataRepositoryFactory);
    await Container.get(OverlayDataRepository, { args: [true, [], []] });

    Container.registerFactory(OverlayService, OverlayServiceFactory);

    Container.registerFactory(ResourceDataRepository, ResourceDataRepositoryFactory);
    await Container.get(ResourceDataRepository, { args: [true] });

    Container.registerFactory(ResourceSerializationService, ResourceSerializationServiceFactory);
    const resourceSerializationService = await Container.get(ResourceSerializationService, { args: [true] });
    resourceSerializationService.registerClass('SharedTestResource', SharedTestResource);
    resourceSerializationService.registerClass('TestResource', TestResource);

    Container.registerFactory(TransactionService, TransactionServiceFactory);
    await Container.get(TransactionService, { args: [true] });
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

    let applyModels;
    beforeEach(async () => {
      const service = await Container.get(TransactionService);
      applyModels = service['applyModels'];
      applyModels = applyModels.bind(service);
    });

    it('should return empty transaction if diffs is empty', async () => {
      const result = await applyModels([]);

      expect(result).toEqual([]);
    });

    it('should throw error when action inputs are not found', async () => {
      const modelAction: IModelAction = {
        ACTION_NAME: 'test',
        collectInput: () => ['input.key1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };

      const app = new App('app');

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [modelAction]);
      diffMetadata.applyOrder = 0;

      await expect(async () => {
        await applyModels([diffMetadata]);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"No matching input found to process action!"`);
    });

    it('should throw error when action resource inputs are not found', async () => {
      const modelAction: IModelAction = {
        ACTION_NAME: 'test',
        collectInput: () => ['resource.key1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };

      const app = new App('app');

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [modelAction]);
      diffMetadata.applyOrder = 0;

      await expect(async () => {
        await applyModels([diffMetadata]);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"No matching input found to process action!"`);
    });

    it('should skip processing diffs that are already applied', async () => {
      const app = new App('app');

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [universalModelAction]);
      diffMetadata.applied = true;
      diffMetadata.applyOrder = 0;

      const result = await applyModels([diffMetadata]);

      expect(result).toEqual([[]]);
    });

    it('should only process 1 matching diff when duplicates found', async () => {
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

      const app = new App('app');

      const diff1 = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata1 = new DiffMetadata(diff1, [universalModelAction]);
      diffMetadata1.applyOrder = 0;
      const diff2 = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata2 = new DiffMetadata(diff2, [universalModelAction]);
      diffMetadata2.applyOrder = 0;

      const result = await applyModels([diffMetadata1, diffMetadata2]);

      expect(result).toMatchSnapshot();
    });

    it('should call action and collect all input and output', async () => {
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

      const app = new App('app');

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [modelAction]);
      diffMetadata.applyOrder = 0;

      await applyModels([diffMetadata]);

      expect(modelAction.handle).toHaveBeenCalledTimes(1);
      expect((modelAction.handle as jest.Mock).mock.calls).toMatchSnapshot();
    });

    it('should update diff metadata with inputs and outputs', async () => {
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

      const app = new App('app');

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [modelAction]);
      diffMetadata.applyOrder = 0;

      await applyModels([diffMetadata]);

      expect(diffMetadata.inputs).toEqual({
        'input.key1': 'value1',
      });
      expect(diffMetadata.outputs['resource1'].resourceId).toBe('resource1');
    });

    it('should call multiple actions and collect all input and output', async () => {
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

      const app = new App('app');

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [modelAction1, modelAction2]);
      diffMetadata.applyOrder = 0;

      await applyModels([diffMetadata]);

      expect(modelAction1.handle).toHaveBeenCalledTimes(1);
      expect((modelAction1.handle as jest.Mock).mock.calls).toMatchSnapshot();
      expect(modelAction2.handle).toHaveBeenCalledTimes(1);
      expect((modelAction2.handle as jest.Mock).mock.calls).toMatchSnapshot();
    });

    it('should process diffs in different levels', async () => {
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

      const {
        app: [app],
        region: [region],
      } = create({ app: ['app'], region: ['region'] });

      const diff1 = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata1 = new DiffMetadata(diff1, [universalModelAction]);
      diffMetadata1.applyOrder = 0;
      const diff2 = new Diff(region, DiffAction.ADD, 'regionId', 'region');
      const diffMetadata2 = new DiffMetadata(diff2, [universalModelAction]);
      diffMetadata2.applyOrder = 1;

      const result = await applyModels([diffMetadata1, diffMetadata2]);

      expect(result).toMatchSnapshot();
    });

    it('should add the shared-resource to set of resources if it does not exist', async () => {
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({
        resource1: new SharedTestResource('shared-resource', { key1: 'value-1' }, []),
      });

      const app = new App('app');

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [universalModelAction]);
      diffMetadata.applyOrder = 0;

      await applyModels([diffMetadata]);

      expect(diffMetadata.outputs['resource1'].resourceId).toBe('shared-resource');
    });

    it('should merge the shared-resource with existing set of resources', async () => {
      const [sharedResource1] = await createTestResources({}, { 'shared-resource': [] });
      sharedResource1.properties['key1'] = 'value-1';

      const sharedResource2 = new SharedTestResource('shared-resource', { key2: 'value-2' }, []);
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({ 'shared-resource': sharedResource2 });
      const mergeFunction = jest.spyOn(sharedResource2 as SharedTestResource, 'merge');

      const app = new App('app');

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [universalModelAction]);
      diffMetadata.applyOrder = 0;

      await applyModels([diffMetadata]);

      expect(mergeFunction).toHaveBeenCalledTimes(1);
      expect(diffMetadata.outputs['shared-resource'].properties).toEqual({ key1: 'value-1', key2: 'value-2' });
    });
  });

  describe('applyResources()', () => {
    const universalResourceAction: IResourceAction = {
      ACTION_NAME: 'universal',
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
      mock: jest.fn() as jest.Mocked<any>,
    };

    let applyResources;
    beforeEach(async () => {
      const service = await Container.get(TransactionService);
      applyResources = service['applyResources'];
      applyResources = applyResources.bind(service);
    });

    it('should return empty transaction if diffs is empty', async () => {
      const result = await applyResources([]);

      expect(result).toEqual([]);
    });

    it('should skip processing diffs that are already applied', async () => {
      const [resource1] = await createTestResources({ 'resource-1': [] });

      const diff = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
      const diffMetadata = new DiffMetadata(diff, [universalResourceAction]);
      diffMetadata.applied = true;
      diffMetadata.applyOrder = 0;

      const result = await applyResources([diffMetadata]);

      expect(result).toEqual([[]]);
    });

    it('should only process 1 matching diff when duplicates found', async () => {
      const [resource1] = await createTestResources({ 'resource-1': [] });

      const diff1 = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
      const diffMetadata1 = new DiffMetadata(diff1, [universalResourceAction]);
      diffMetadata1.applyOrder = 0;
      const diff2 = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
      const diffMetadata2 = new DiffMetadata(diff2, [universalResourceAction]);
      diffMetadata2.applyOrder = 0;

      const result = await applyResources([diffMetadata1, diffMetadata2]);

      expect(result).toMatchSnapshot();
    });

    it('should process diffs of resources per dependency graph', async () => {
      const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });

      const diff1 = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
      const diffMetadata1 = new DiffMetadata(diff1, [universalResourceAction]);
      diffMetadata1.applyOrder = 1;
      const diff2 = new Diff(resource2, DiffAction.ADD, 'resourceId', 'resource-2');
      const diffMetadata2 = new DiffMetadata(diff2, [universalResourceAction]);
      diffMetadata2.applyOrder = 0;

      const result = await applyResources([diffMetadata1, diffMetadata2]);

      expect(result).toMatchSnapshot();
    });

    it('should call mock when run with enableResourceCapture flag on', async () => {
      const [resource1] = await createTestResources({ 'resource-1': [] });

      const diff = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
      const diffMetadata = new DiffMetadata(diff, [universalResourceAction]);
      diffMetadata.applyOrder = 0;

      const captureService = await Container.get(CaptureService);
      captureService.registerCapture('resource-1', {}, { 'key-1': 'value-1' });

      await applyResources([diffMetadata], { enableResourceCapture: true });

      expect(universalResourceAction.mock).toHaveBeenCalledTimes(1);
      expect((universalResourceAction.mock as jest.Mock).mock.calls[0][0]).toEqual({ 'key-1': 'value-1' });
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
      const {
        environment: [environment],
      } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });

      const diff = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diffMetadata = new DiffMetadata(diff, modelActions);
      diffMetadata.applyOrder = 1;

      expect(diffMetadata.applyOrder).toBe(1);
      setApplyOrder(diffMetadata, [diffMetadata]);
      expect(diffMetadata.applyOrder).toBe(1);
    });

    it('should set order 0 for diff with no dependencies', () => {
      const {
        environment: [environment],
      } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });

      const diff = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diffMetadata = new DiffMetadata(diff, modelActions);

      expect(diffMetadata.applyOrder).toBe(-1);
      setApplyOrder(diffMetadata, [diffMetadata]);
      expect(diffMetadata.applyOrder).toBe(0);
    });

    it('should set order 0 for diff with dependencies not in current array of diffs', () => {
      const {
        environment: [environment],
      } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });

      const diff = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diffMetadata = new DiffMetadata(diff, modelActions);

      expect(diffMetadata.applyOrder).toBe(-1);
      setApplyOrder(diffMetadata, [diffMetadata]);
      expect(diffMetadata.applyOrder).toBe(0);
    });

    it('should only set order for the diff and its dependencies', () => {
      const {
        environment: [environment],
        region: [region1, region2],
      } = create({ app: ['test'], environment: ['qa'], region: ['region-1', 'region-2:-1'] });

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
      const {
        environment: [environment],
        region: [region],
      } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });

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
      const {
        app: [app],
        environment: [environment],
        region: [region],
      } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });

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
      }).toThrow('Dependency relationship already exists!');
      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
    });

    it('should throw errors with 2 level of circular dependencies', () => {
      const {
        app: [app],
        environment: [environment],
        region: [region],
      } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });
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
      }).toThrow('Found circular dependencies!');
      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      expect(diffsMetadata[2].applyOrder).toBe(-1);
    });

    it('should throw errors if add and update of model are in same transaction', () => {
      const {
        environment: [environment],
        region: [region],
      } = create({ app: ['test'], environment: ['env'], region: ['region-1'] });

      const diff1 = new Diff(region, DiffAction.ADD, 'regionId', 'region');
      const diff2 = new Diff(environment, DiffAction.ADD, 'environmentName', 'env');
      const diff3 = new Diff(environment, DiffAction.UPDATE, 'environmentName', 'env');
      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, modelActions));

      expect(() => {
        setApplyOrder(diffsMetadata[0], diffsMetadata);
        setApplyOrder(diffsMetadata[1], diffsMetadata);
        setApplyOrder(diffsMetadata[2], diffsMetadata);
      }).toThrow('Found conflicting actions in same transaction!');
    });
  });

  describe('beginTransaction()', () => {
    describe('yieldModelDiffs', () => {
      const universalModelAction: IModelAction = {
        ACTION_NAME: 'universal',
        collectInput: () => [],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        revert: jest.fn() as jest.Mocked<any>,
      };

      it('should yield model diffs', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const app = new App('app');
        const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

        const service = await Container.get(TransactionService);
        service.registerModelActions([universalModelAction]);
        const generator = service.beginTransaction(diffs, { yieldModelDiffs: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });

      it('should yield model diffs with overlays', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const {
          app: [app],
        } = create({ app: ['app'] });
        const anchor1 = new TestAnchor('anchor-1', {}, app);
        app.addAnchor(anchor1);

        await createTestOverlays({ 'test-overlay': [anchor1] });

        const service = await Container.get(TransactionService);
        service.registerOverlayActions([universalModelAction]);
        const generator = service.beginTransaction([], { yieldModelDiffs: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });

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

        const {
          app: [app],
        } = create({ app: ['app'] });
        const anchor1 = new TestAnchor('anchor-1', {}, app);
        app.addAnchor(anchor1);

        await createTestOverlays({ 'test-overlay': [anchor1] });

        const service = await Container.get(TransactionService);
        service.registerOverlayActions([universalModelAction]);
        const generator = service.beginTransaction([], { yieldModelTransaction: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });

    describe('yieldResourceDiffs', () => {
      const universalResourceAction: IResourceAction = {
        ACTION_NAME: 'universal',
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        mock: jest.fn() as jest.Mocked<any>,
      };

      it('should yield resource diffs', async () => {
        const [resource1] = await createTestResources({ 'resource-1': [] });
        await commitResources();

        // Replace resource1 with resource2.
        resource1.remove();
        await createTestResources({ 'resource-2': [] });

        const service = await Container.get(TransactionService);
        service.registerResourceActions([universalResourceAction]);
        const generator = service.beginTransaction([], { yieldResourceDiffs: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });

    describe('yieldResourceTransaction', () => {
      const universalResourceAction: IResourceAction = {
        ACTION_NAME: 'universal',
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        mock: jest.fn() as jest.Mocked<any>,
      };

      it('should yield resource transaction', async () => {
        const [resource1] = await createTestResources({ 'resource-1': [] });
        await commitResources();

        // Replace resource1 with resource2.
        resource1.remove();
        await createTestResources({ 'resource-2': [] });

        const service = await Container.get(TransactionService);
        service.registerResourceActions([universalResourceAction]);
        const generator = service.beginTransaction([], { yieldResourceTransaction: true });

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
      const resourceDataRepository = await Container.get(ResourceDataRepository);

      // Assume a resource has been added. Upon revert, the new state should have this resource deleted.
      await createTestResources({ 'resource-1': [] });
      await commitResources();

      // Upon calling rollbackTransaction(), assume model's revert method marks the new resource as deleted.
      resourceDataRepository.getById('resource-1')!.remove();

      const service = await Container.get(TransactionService);
      service.registerResourceActions([
        {
          ACTION_NAME: 'test',
          filter: (): boolean => true,
          handle: jest.fn() as jest.Mocked<any>,
          mock: jest.fn() as jest.Mocked<any>,
        },
      ]);

      const generator = service.rollbackTransaction([], { yieldResourceTransaction: true });
      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });

    it('should be able to revert deletion of resources', async () => {
      await Container.get(ResourceDataRepository);

      // Assume a resource has been deleted. Upon revert, the new state should have this resource added.
      await commitResources();

      // Upon calling rollbackTransaction(), assume model's revert method adds the new resource again.
      await createTestResources({ 'resource-1': [] });

      const service = await Container.get(TransactionService);
      service.registerResourceActions([
        {
          ACTION_NAME: 'test',
          filter: (): boolean => true,
          handle: jest.fn() as jest.Mocked<any>,
          mock: jest.fn() as jest.Mocked<any>,
        },
      ]);

      const generator = service.rollbackTransaction([], { yieldResourceDiffs: true });
      const result = await generator.next();

      expect(result.value).toMatchSnapshot();
    });
  });
});
