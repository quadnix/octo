import { jest } from '@jest/globals';
import { SharedTestResource, TestAnchor, TestOverlay, TestResource } from '../../../test/helpers/test-classes.js';
import { commitResources, create, createTestOverlays, createTestResources } from '../../../test/helpers/test-models.js';
import type { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { DiffMetadata } from '../../functions/diff/diff-metadata.js';
import { Diff, DiffAction } from '../../functions/diff/diff.js';
import { type IModelAction } from '../../models/model-action.interface.js';
import { App } from '../../models/app/app.model.js';
import { Region } from '../../models/region/region.model.js';
import { OverlayDataRepository, OverlayDataRepositoryFactory } from '../../overlays/overlay-data.repository.js';
import { OverlayService } from '../../overlays/overlay.service.js';
import { type IResourceAction } from '../../resources/resource-action.interface.js';
import { ResourceDataRepository, ResourceDataRepositoryFactory } from '../../resources/resource-data.repository.js';
import { CaptureService } from '../capture/capture.service.js';
import { InputService } from '../input/input.service.js';
import { ResourceSerializationService } from '../serialization/resource/resource-serialization.service.js';
import { TransactionService } from './transaction.service.js';

describe('TransactionService UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    // In these tests, we commit models, which resets the OverlayDataRepository.
    // We cannot use TestContainer to mock OverlayDataRepositoryFactory,
    // or else commit of models won't reset anything.
    container.registerFactory(OverlayDataRepository, OverlayDataRepositoryFactory);
    const overlayDataRepository = await container.get<OverlayDataRepository, typeof OverlayDataRepositoryFactory>(
      OverlayDataRepository,
      {
        args: [true],
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

    const captureService = new CaptureService();
    container.registerValue(CaptureService, captureService);

    const inputService = new InputService(resourceDataRepository);
    container.registerValue(InputService, inputService);

    container.registerValue(OverlayService, new OverlayService(overlayDataRepository));

    const resourceSerializationService = new ResourceSerializationService(resourceDataRepository);
    resourceSerializationService.registerClass('@octo/SharedTestResource', SharedTestResource);
    resourceSerializationService.registerClass('@octo/TestResource', TestResource);
    container.registerValue<ResourceSerializationService>(ResourceSerializationService, resourceSerializationService);

    container.registerValue(
      TransactionService,
      new TransactionService(captureService, inputService, overlayDataRepository, resourceDataRepository),
    );
  });

  afterEach(async () => {
    await TestContainer.reset();

    jest.restoreAllMocks();
  });

  describe('applyModels()', () => {
    const universalModelAction: IModelAction = {
      collectInput: () => [],
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
    };

    let applyModels;
    beforeEach(async () => {
      const service = await container.get(TransactionService);
      applyModels = service['applyModels'];
      applyModels = applyModels.bind(service);
    });

    it('should return empty transaction if diffs is empty', async () => {
      const result = await applyModels([]);

      expect(result).toEqual([]);
    });

    it('should throw error when action inputs are not found', async () => {
      const modelAction: IModelAction = {
        collectInput: () => ['input.key1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
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
        collectInput: () => ['resource.key1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
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
        collectInput: () => ['input.key1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };
      (modelAction.handle as jest.Mocked<any>).mockResolvedValue({
        resource1: new TestResource('resource1'),
      });

      const inputService = await container.get(InputService);
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
        collectInput: () => ['input.key1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };
      (modelAction.handle as jest.Mocked<any>).mockResolvedValue({ resource1: new TestResource('resource1') });

      const inputService = await container.get(InputService);
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
        collectInput: () => ['input.key1'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };
      (modelAction1.handle as jest.Mocked<any>).mockResolvedValue({ resource1: new TestResource('resource1') });
      const modelAction2: IModelAction = {
        collectInput: () => ['input.key2'],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };
      (modelAction2.handle as jest.Mocked<any>).mockResolvedValue({ resource2: new TestResource('resource2') });

      const inputService = await container.get(InputService);
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
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
      mock: jest.fn() as jest.Mocked<any>,
    };

    let applyResources;
    beforeEach(async () => {
      const service = await container.get(TransactionService);
      applyResources = service['applyResources'];
      applyResources = applyResources.bind(service);
    });

    it('should return empty transaction if diffs is empty', async () => {
      const result = await applyResources([]);

      expect(result).toEqual([]);
    });

    it('should skip processing diffs that are already applied', async () => {
      (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue();
      const [resource1] = await createTestResources({ 'resource-1': [] });

      const diff = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
      const diffMetadata = new DiffMetadata(diff, [universalResourceAction]);
      diffMetadata.applied = true;
      diffMetadata.applyOrder = 0;

      const result = await applyResources([diffMetadata]);

      expect(result).toEqual([[]]);
    });

    it('should only process 1 matching diff when duplicates found', async () => {
      (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue();
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
      (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue();
      const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });

      const diff1 = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
      const diffMetadata1 = new DiffMetadata(diff1, [universalResourceAction]);
      diffMetadata1.applyOrder = 0;
      const diff2 = new Diff(resource2, DiffAction.ADD, 'resourceId', 'resource-2');
      const diffMetadata2 = new DiffMetadata(diff2, [universalResourceAction]);
      diffMetadata2.applyOrder = 1;

      const result = await applyResources([diffMetadata2, diffMetadata1]);

      expect(result).toMatchSnapshot();
    });

    it('should call mock when run with enableResourceCapture flag on', async () => {
      const [resource1] = await createTestResources({ 'resource-1': [] });

      const diff = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
      const diffMetadata = new DiffMetadata(diff, [universalResourceAction]);
      diffMetadata.applyOrder = 0;

      const captureService = await container.get(CaptureService);
      captureService.registerCapture('resource-1', { 'key-1': 'value-1' });

      await applyResources([diffMetadata], { enableResourceCapture: true });

      expect(universalResourceAction.mock).toHaveBeenCalledTimes(1);
      expect((universalResourceAction.mock as jest.Mock).mock.calls[0][0]).toEqual({ 'key-1': 'value-1' });
    });
  });

  describe('setApplyOrder()', () => {
    const modelActions: IModelAction[] = [
      {
        collectInput: () => [],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      },
    ];
    let setApplyOrder: TransactionService['setApplyOrder'];

    beforeEach(async () => {
      const service = await container.get(TransactionService);
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
        collectInput: () => [],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };

      it('should yield model diffs', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const app = new App('app');
        const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

        const service = await container.get(TransactionService);
        service.registerModelActions(App, [universalModelAction]);
        const generator = service.beginTransaction(diffs, { yieldModelDiffs: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });

      it('should yield model diffs with overlays', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const {
          app: [app],
        } = create({ app: ['app'], image: ['image'] });
        const anchor1 = new TestAnchor('anchor-1', {}, app);
        app.addAnchor(anchor1);

        await createTestOverlays({ 'test-overlay': [anchor1] });

        const service = await container.get(TransactionService);
        service.registerOverlayActions(TestOverlay, [universalModelAction]);
        const generator = service.beginTransaction([], { yieldModelDiffs: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });

    describe('yieldModelTransaction', () => {
      const universalModelAction: IModelAction = {
        collectInput: () => [],
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };

      it('should yield model transaction', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const app = new App('app');
        const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

        const service = await container.get(TransactionService);
        service.registerModelActions(App, [universalModelAction]);
        const generator = service.beginTransaction(diffs, { yieldModelTransaction: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });

      it('should yield model transaction with overlays', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const {
          app: [app],
        } = create({ app: ['app'], image: ['image'] });
        const anchor1 = new TestAnchor('anchor-1', {}, app);
        app.addAnchor(anchor1);

        await createTestOverlays({ 'test-overlay': [anchor1] });

        const service = await container.get(TransactionService);
        service.registerOverlayActions(TestOverlay, [universalModelAction]);
        const generator = service.beginTransaction([], { yieldModelTransaction: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });

    describe('yieldResourceDiffs', () => {
      const universalResourceAction: IResourceAction = {
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        mock: jest.fn() as jest.Mocked<any>,
      };

      it('should yield resource diffs', async () => {
        await createTestResources({ 'resource-1': [] });
        await commitResources();

        // Replace resource1 with resource2.
        // Since after commitResources() new resources are empty,
        // so we need to just add resource-2 in order to replace resource-1.
        await createTestResources({ 'resource-2': [] });

        const service = await container.get(TransactionService);
        service.registerResourceActions(TestResource, [universalResourceAction]);
        const generator = service.beginTransaction([], { yieldResourceDiffs: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });

    describe('yieldResourceTransaction', () => {
      const universalResourceAction: IResourceAction = {
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        mock: jest.fn() as jest.Mocked<any>,
      };

      it('should yield resource transaction', async () => {
        (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue();

        await createTestResources({ 'resource-1': [] });
        await commitResources();

        // Replace resource1 with resource2.
        // Since after commitResources() new resources are empty,
        // so we need to just add resource-2 in order to replace resource-1.
        await createTestResources({ 'resource-2': [] });

        const service = await container.get(TransactionService);
        service.registerResourceActions(TestResource, [universalResourceAction]);
        const generator = service.beginTransaction([], { yieldResourceTransaction: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });
  });
});
