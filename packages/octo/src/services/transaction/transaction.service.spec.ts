import { jest } from '@jest/globals';
import { type UnknownModel, type UnknownModule, type UnknownResource, stub } from '../../app.type.js';
import type { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { DiffMetadata } from '../../functions/diff/diff-metadata.js';
import { Diff, DiffAction } from '../../functions/diff/diff.js';
import { Account } from '../../models/account/account.model.js';
import { AccountType } from '../../models/account/account.schema.js';
import { App } from '../../models/app/app.model.js';
import type { IModelAction } from '../../models/model-action.interface.js';
import { Region } from '../../models/region/region.model.js';
import { ModuleContainer } from '../../modules/module.container.js';
import { TestModuleContainer } from '../../modules/test-module.container.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import type { IResourceAction } from '../../resources/resource-action.interface.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import {
  TestAnchor,
  TestAppModule,
  TestOverlay,
  TestOverlayModule,
  TestResource,
} from '../../utilities/test-helpers/test-classes.js';
import {
  commitResources,
  create,
  createTestOverlays,
  createTestResources,
} from '../../utilities/test-helpers/test-models.js';
import { CaptureService } from '../capture/capture.service.js';
import { EventService } from '../event/event.service.js';
import { InputService } from '../input/input.service.js';
import { ResourceSerializationService } from '../serialization/resource/resource-serialization.service.js';
import { TestStateProvider } from '../state-management/test.state-provider.js';
import { TransactionService } from './transaction.service.js';

describe('TransactionService UT', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    const [captureService, eventService, inputService, moduleContainer, overlayDataRepository, resourceDataRepository] =
      await Promise.all([
        container.get(CaptureService),
        container.get(EventService),
        container.get(InputService),
        container.get(ModuleContainer),
        container.get(OverlayDataRepository),
        container.get(ResourceDataRepository),
      ]);

    const resourceSerializationService = new ResourceSerializationService(resourceDataRepository);
    resourceSerializationService.registerClass('@octo/TestResource', TestResource);
    container.unRegisterFactory(ResourceSerializationService);
    container.registerValue(ResourceSerializationService, resourceSerializationService);

    const transactionService = new TransactionService(
      captureService,
      eventService,
      inputService,
      moduleContainer,
      overlayDataRepository,
      resourceDataRepository,
    );
    container.unRegisterFactory(TransactionService);
    container.registerValue(TransactionService, transactionService);

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(new TestStateProvider());
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();

    jest.restoreAllMocks();
  });

  describe('applyModels()', () => {
    const universalModelAction: IModelAction<UnknownModule> = {
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
    };

    let applyModels: TransactionService['applyModels'];

    beforeEach(async () => {
      const service = await container.get(TransactionService);
      applyModels = service['applyModels'];
      applyModels = applyModels.bind(service);
    });

    afterEach(() => {
      (universalModelAction.handle as jest.Mock).mockReset();
    });

    it('should return empty transaction if diffs is empty', async () => {
      const result = await applyModels([]);

      expect(result).toEqual([]);
    });

    it('should throw error when action inputs are not found', async () => {
      const { 'moduleId.model.app': app } = await testModuleContainer.runModule<TestAppModule>({
        inputs: { name: 'test-app' },
        moduleId: 'moduleId',
        type: TestAppModule,
      });

      // After module has ran, fabricate a scenario where module created a model which does not exist.
      // This scenario is not possible in real life, but is useful for testing.
      const inputService = await container.get(InputService);
      inputService['models']['moduleId.model.unknown'] = undefined as unknown as UnknownModel;

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [universalModelAction]);
      diffMetadata.applyOrder = 0;

      await expect(async () => {
        await applyModels([diffMetadata]);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"No matching input found to process action!"`);
    });

    it('should throw error when action resource inputs are not found', async () => {
      const { 'moduleId.model.app': app } = await testModuleContainer.runModule<TestAppModule>({
        inputs: { name: 'test-app' },
        moduleId: 'moduleId',
        type: TestAppModule,
      });

      // After module has ran, fabricate a scenario where module created a resource which does not exist.
      // This scenario is not possible in real life, but is useful for testing.
      const inputService = await container.get(InputService);
      inputService['resources']['moduleId.resource.unknown'] = undefined as unknown as string;

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [universalModelAction]);
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

      const { 'moduleId.model.app': app } = await testModuleContainer.runModule<TestAppModule>({
        inputs: { name: 'app' },
        moduleId: 'moduleId',
        type: TestAppModule,
      });

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
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({
        resource1: new TestResource('resource1'),
      });

      const { 'moduleId.model.app': app } = await testModuleContainer.runModule<TestAppModule>({
        inputs: { name: 'app' },
        moduleId: 'moduleId',
        type: TestAppModule,
      });

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [universalModelAction]);
      diffMetadata.applyOrder = 0;

      await applyModels([diffMetadata]);

      expect(universalModelAction.handle).toHaveBeenCalledTimes(1);
      expect((universalModelAction.handle as jest.Mock).mock.calls).toMatchSnapshot();
    });

    it('should update diff metadata with inputs and outputs', async () => {
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({ resource1: new TestResource('resource1') });

      const { 'moduleId.model.app': app } = await testModuleContainer.runModule<TestAppModule>({
        inputs: { name: 'app' },
        moduleId: 'moduleId',
        type: TestAppModule,
      });

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [universalModelAction]);
      diffMetadata.applyOrder = 0;

      await applyModels([diffMetadata]);

      expect(diffMetadata.inputs).toEqual({
        inputs: {
          name: 'app',
        },
        metadata: {},
        models: {
          app,
        },
        overlays: {},
        resources: {},
      });
      expect(diffMetadata.outputs['resource1'].resourceId).toBe('resource1');
    });

    it('should call multiple actions and collect all input and output', async () => {
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValueOnce({
        resource1: new TestResource('resource1'),
      });
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValueOnce({
        resource2: new TestResource('resource2'),
      });

      const { 'moduleId.model.app': app } = await testModuleContainer.runModule<TestAppModule>({
        inputs: { name: 'app' },
        moduleId: 'moduleId',
        type: TestAppModule,
      });

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [universalModelAction, universalModelAction]);
      diffMetadata.applyOrder = 0;

      await applyModels([diffMetadata]);

      expect(universalModelAction.handle).toHaveBeenCalledTimes(2);
      expect((universalModelAction.handle as jest.Mock).mock.calls).toMatchSnapshot();
    });

    it('should merge resources with same context', async () => {
      const resource1_1 = new TestResource('resource1');
      const resource1_2 = new TestResource('resource1');
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValueOnce({
        resource1: resource1_1,
      });
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValueOnce({
        resource1: resource1_2,
      });
      const mergeFunction1_1 = jest.spyOn(resource1_1, 'merge');
      const mergeFunction1_2 = jest.spyOn(resource1_2, 'merge');

      const { 'moduleId.model.app': app } = await testModuleContainer.runModule<TestAppModule>({
        inputs: { name: 'app' },
        moduleId: 'moduleId',
        type: TestAppModule,
      });

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [universalModelAction, universalModelAction]);
      diffMetadata.applyOrder = 0;

      await applyModels([diffMetadata]);

      expect(universalModelAction.handle).toHaveBeenCalledTimes(2);
      expect((universalModelAction.handle as jest.Mock).mock.calls).toMatchSnapshot();
      expect(mergeFunction1_1).not.toHaveBeenCalled();
      expect(mergeFunction1_2).toHaveBeenCalledTimes(1);
    });

    it('should process diffs in different levels', async () => {
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

      const { 'moduleId.model.app': app } = await testModuleContainer.runModule<TestAppModule>({
        inputs: { name: 'app' },
        moduleId: 'moduleId',
        type: TestAppModule,
      });

      const diff1 = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata1 = new DiffMetadata(diff1, [universalModelAction]);
      diffMetadata1.applyOrder = 0;
      const diff2 = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata2 = new DiffMetadata(diff2, [universalModelAction]);
      diffMetadata2.applyOrder = 1;

      const result = await applyModels([diffMetadata1, diffMetadata2]);

      expect(result).toMatchSnapshot();
    });
  });

  describe('applyResources()', () => {
    const universalResourceAction: IResourceAction<UnknownResource> = {
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
      mock: jest.fn() as jest.Mocked<any>,
    };

    let applyResources: TransactionService['applyResources'];

    beforeEach(async () => {
      const service = await container.get(TransactionService);
      applyResources = service['applyResources'];
      applyResources = applyResources.bind(service);
    });

    afterEach(() => {
      (universalResourceAction.handle as jest.Mock).mockReset();
      (universalResourceAction.mock as jest.Mock).mockReset();
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

      const inputService = await container.get(InputService);
      inputService.registerResource('moduleId', resource1);

      const diff = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
      const diffMetadata = new DiffMetadata(diff, [universalResourceAction]);
      diffMetadata.applyOrder = 0;

      const captureService = await container.get(CaptureService);
      captureService.registerCapture('@octo/test-resource=resource-1', { 'key-1': 'value-1' });

      await applyResources([diffMetadata], { enableResourceCapture: true });

      expect(universalResourceAction.mock).toHaveBeenCalledTimes(1);
      expect((universalResourceAction.mock as jest.Mock).mock.calls[0][1]).toEqual({ 'key-1': 'value-1' });
    });
  });

  describe('setApplyOrder()', () => {
    const modelActions: IModelAction<UnknownModule>[] = [
      {
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

    afterEach(() => {
      (modelActions[0].handle as jest.Mock).mockReset();
    });

    it('should not set order for diff that already has an order defined', () => {
      const {
        environment: [environment],
      } = create({ account: ['aws,account'], app: ['test'], environment: ['qa'], region: ['region-1'] });

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
      } = create({ account: ['aws,account'], app: ['test'], environment: ['qa'], region: ['region-1'] });

      const diff = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diffMetadata = new DiffMetadata(diff, modelActions);

      expect(diffMetadata.applyOrder).toBe(-1);
      setApplyOrder(diffMetadata, [diffMetadata]);
      expect(diffMetadata.applyOrder).toBe(0);
    });

    it('should set order 0 for diff with dependencies not in current array of diffs', () => {
      const {
        environment: [environment],
      } = create({ account: ['aws,account'], app: ['test'], environment: ['qa'], region: ['region-1'] });

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
      } = create({ account: ['aws,account'], app: ['test'], environment: ['qa'], region: ['region-1', 'region-2:-1'] });

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
      } = create({ account: ['aws,account'], app: ['test'], environment: ['qa'], region: ['region-1'] });

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
        account: [account],
        app: [app],
        environment: [environment],
        region: [region],
      } = create({ account: ['aws,account'], app: ['test'], environment: ['qa'], region: ['region-1'] });

      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(region, DiffAction.ADD, 'regionId', 'region-1');
      const diff3 = new Diff(account, DiffAction.ADD, 'accountId', 'account');
      const diff4 = new Diff(app, DiffAction.ADD, 'name', 'test');
      const diffsMetadata = [diff1, diff2, diff3, diff4].map((d) => new DiffMetadata(d, modelActions));

      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      expect(diffsMetadata[2].applyOrder).toBe(-1);
      expect(diffsMetadata[3].applyOrder).toBe(-1);
      setApplyOrder(diffsMetadata[0], diffsMetadata);
      expect(diffsMetadata[0].applyOrder).toBe(3);
      expect(diffsMetadata[1].applyOrder).toBe(2);
      expect(diffsMetadata[2].applyOrder).toBe(1);
      expect(diffsMetadata[3].applyOrder).toBe(0);
    });

    it('should throw errors with 1 level of circular dependencies', () => {
      const app = new App('test');
      const account = new Account(AccountType.AWS, 'account');
      const region = new Region('region-1');

      const diff1 = new Diff(region, DiffAction.ADD, 'regionId', 'region-1');
      const diff2 = new Diff(account, DiffAction.ADD, 'accountId', 'account');
      const diff3 = new Diff(app, DiffAction.ADD, 'name', 'test');
      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, modelActions));

      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      expect(diffsMetadata[2].applyOrder).toBe(-1);
      expect(() => {
        app.addAccount(account);
        account.addRegion(region);
        region.addChild('regionId', account, 'accountId');
        setApplyOrder(diffsMetadata[0], diffsMetadata);
      }).toThrow('Found circular dependencies!');
      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      expect(diffsMetadata[2].applyOrder).toBe(0);
    });

    it('should throw errors with 2 level of circular dependencies', () => {
      const {
        account: [account],
        app: [app],
        environment: [environment],
        region: [region],
      } = create({ account: ['aws,account'], app: ['test'], environment: ['qa'], region: ['region-1'] });
      environment.addChild('environmentName', app, 'name');

      const diff1 = new Diff(environment, DiffAction.ADD, 'environmentName', 'qa');
      const diff2 = new Diff(region, DiffAction.ADD, 'regionId', 'region-1');
      const diff3 = new Diff(account, DiffAction.ADD, 'accountId', 'account');
      const diff4 = new Diff(app, DiffAction.ADD, 'name', 'test');
      const diffsMetadata = [diff1, diff2, diff3, diff4].map((d) => new DiffMetadata(d, modelActions));

      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      expect(diffsMetadata[2].applyOrder).toBe(-1);
      expect(diffsMetadata[3].applyOrder).toBe(-1);
      expect(() => {
        setApplyOrder(diffsMetadata[0], diffsMetadata);
      }).toThrow('Found circular dependencies!');
      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      expect(diffsMetadata[2].applyOrder).toBe(-1);
      expect(diffsMetadata[3].applyOrder).toBe(-1);
    });

    it('should throw errors if add and delete of model are in same transaction', () => {
      const {
        environment: [environment],
        region: [region],
      } = create({ account: ['aws,account'], app: ['test'], environment: ['env'], region: ['region-1'] });

      const diff1 = new Diff(region, DiffAction.ADD, 'regionId', 'region');
      const diff2 = new Diff(environment, DiffAction.ADD, 'environmentName', 'env');
      const diff3 = new Diff(environment, DiffAction.DELETE, 'environmentName', 'env');
      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, modelActions));

      expect(() => {
        setApplyOrder(diffsMetadata[0], diffsMetadata);
        setApplyOrder(diffsMetadata[1], diffsMetadata);
        setApplyOrder(diffsMetadata[2], diffsMetadata);
      }).toThrow('Found conflicting actions in same transaction!');
    });

    it('should process an ADD diff before an UPDATE diff of the same node', () => {
      const {
        environment: [environment],
        region: [region],
      } = create({ account: ['aws,account'], app: ['test'], environment: ['env'], region: ['region-1'] });

      const diff1 = new Diff(region, DiffAction.ADD, 'regionId', 'region');
      const diff2 = new Diff(environment, DiffAction.ADD, 'environmentName', 'env');
      const diff3 = new Diff(environment, DiffAction.UPDATE, 'environmentName', 'env');
      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, modelActions));

      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      expect(diffsMetadata[2].applyOrder).toBe(-1);
      setApplyOrder(diffsMetadata[2], diffsMetadata);
      setApplyOrder(diffsMetadata[1], diffsMetadata);
      setApplyOrder(diffsMetadata[0], diffsMetadata);
      expect(diffsMetadata[0].applyOrder).toBe(0);
      expect(diffsMetadata[1].applyOrder).toBe(1);
      expect(diffsMetadata[2].applyOrder).toBe(2);
    });

    it('should process an UPDATE diff before a DELETE diff of the same node', () => {
      const {
        environment: [environment],
        region: [region],
      } = create({ account: ['aws,account'], app: ['test'], environment: ['env'], region: ['region-1'] });

      const diff1 = new Diff(region, DiffAction.ADD, 'regionId', 'region');
      const diff2 = new Diff(environment, DiffAction.UPDATE, 'environmentName', 'env');
      const diff3 = new Diff(environment, DiffAction.DELETE, 'environmentName', 'env');
      const diffsMetadata = [diff1, diff2, diff3].map((d) => new DiffMetadata(d, modelActions));

      expect(diffsMetadata[0].applyOrder).toBe(-1);
      expect(diffsMetadata[1].applyOrder).toBe(-1);
      expect(diffsMetadata[2].applyOrder).toBe(-1);
      setApplyOrder(diffsMetadata[2], diffsMetadata);
      setApplyOrder(diffsMetadata[1], diffsMetadata);
      setApplyOrder(diffsMetadata[0], diffsMetadata);
      expect(diffsMetadata[0].applyOrder).toBe(0);
      expect(diffsMetadata[1].applyOrder).toBe(0);
      expect(diffsMetadata[2].applyOrder).toBe(1);
    });
  });

  describe('beginTransaction()', () => {
    describe('yieldModelDiffs', () => {
      const universalModelAction: IModelAction<UnknownModule> = {
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };

      afterEach(() => {
        (universalModelAction.handle as jest.Mock).mockReset();
      });

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
        } = create({ account: ['aws,account'], app: ['app'] });
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
      const universalModelAction: IModelAction<UnknownModule> = {
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };

      afterEach(() => {
        (universalModelAction.handle as jest.Mock).mockReset();
      });

      it('should yield model transaction', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const { 'moduleId.model.app': app } = await testModuleContainer.runModule<TestAppModule>({
          inputs: { name: 'app' },
          moduleId: 'moduleId',
          type: TestAppModule,
        });
        const diffs = [new Diff(app, DiffAction.ADD, 'name', 'app')];

        const service = await container.get(TransactionService);
        service.registerModelActions(App, [universalModelAction]);
        const generator = service.beginTransaction(diffs, { yieldModelTransaction: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });

      it('should yield model transaction with overlays', async () => {
        (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

        const { 'moduleId.model.app': app } = await testModuleContainer.runModule<TestAppModule>({
          inputs: { name: 'app' },
          moduleId: 'moduleId',
          type: TestAppModule,
        });
        const anchor1 = new TestAnchor('anchor-1', {}, app);
        app.addAnchor(anchor1);

        await testModuleContainer.runModule<TestOverlayModule>({
          inputs: { anchorName: 'anchor-1', app: stub('${{moduleId.model.app}}') },
          moduleId: 'overlayModuleId',
          type: TestOverlayModule,
        });

        const service = await container.get(TransactionService);
        service.registerOverlayActions(TestOverlay, [universalModelAction]);
        const generator = service.beginTransaction([], { yieldModelTransaction: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });

    describe('yieldResourceDiffs', () => {
      const universalResourceAction: IResourceAction<UnknownResource> = {
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        mock: jest.fn() as jest.Mocked<any>,
      };

      afterEach(() => {
        (universalResourceAction.handle as jest.Mock).mockReset();
        (universalResourceAction.mock as jest.Mock).mockReset();
      });

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
      const universalResourceAction: IResourceAction<UnknownResource> = {
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
        mock: jest.fn() as jest.Mocked<any>,
      };

      afterEach(() => {
        (universalResourceAction.handle as jest.Mock).mockReset();
        (universalResourceAction.mock as jest.Mock).mockReset();
      });

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
