import { jest } from '@jest/globals';
import { type UnknownModel, type UnknownModule, type UnknownResource, stub } from '../../app.type.js';
import { ResourceActionExceptionTransactionError } from '../../errors/index.js';
import type { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { DiffMetadata } from '../../functions/diff/diff-metadata.js';
import { Diff, DiffAction } from '../../functions/diff/diff.js';
import { Account } from '../../models/account/account.model.js';
import { AccountType } from '../../models/account/account.schema.js';
import { App } from '../../models/app/app.model.js';
import type { IModelAction } from '../../models/model-action.interface.js';
import { Region } from '../../models/region/region.model.js';
import { TestModuleContainer } from '../../modules/test-module.container.js';
import type { IResourceAction } from '../../resources/resource-action.interface.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { TestOverlay } from '../../utilities/test-helpers/test-classes.js';
import { create } from '../../utilities/test-helpers/test-models.js';
import { createAppModule, createAppOverlayModule } from '../../utilities/test-helpers/test-modules.js';
import { createAnchor, createTestOverlays } from '../../utilities/test-helpers/test-overlays.js';
import {
  commitResources,
  createResource,
  createTerraformResource,
  createTestResources,
} from '../../utilities/test-helpers/test-resources.js';
import { InputService } from '../input/input.service.js';
import { TestStateProvider } from '../state-management/test.state-provider.js';
import { TerraformService } from '../terraform/terraform.service.js';
import { TransactionService } from './transaction.service.js';

const TestAnchor = createAnchor().setClassName('TestAnchor');
const TestAppModule = createAppModule().setClassName('TestAppModule');
const TestAppOverlayModule = createAppOverlayModule().setClassName('TestAppOverlayModule');
const TestResource = createResource('test-resource').setClassName('TestResource');

describe('TransactionService UT', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500, force: true });

    testModuleContainer = new TestModuleContainer(container);
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
      const { 'moduleId.model.app': app } = await testModuleContainer.runModule({
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
      const { 'moduleId.model.app': app } = await testModuleContainer.runModule({
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

      const { 'moduleId.model.app': app } = await testModuleContainer.runModule({
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
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

      const { 'moduleId.model.app': app } = await testModuleContainer.runModule({
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
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

      const { 'moduleId.model.app': app } = await testModuleContainer.runModule({
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
      expect(diffMetadata.outputs).toEqual({});
    });

    it('should call multiple actions and collect all input and output', async () => {
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValueOnce({});
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValueOnce({});

      const { 'moduleId.model.app': app } = await testModuleContainer.runModule({
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

      const { 'moduleId.model.app': app } = await testModuleContainer.runModule({
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

      const { 'moduleId.model.app': app } = await testModuleContainer.runModule({
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
    };
    const universalResourceActionWithTimeout: IResourceAction<UnknownResource> = {
      actionTimeoutInMs: 100,
      filter: () => true,
      handle: jest.fn() as jest.Mocked<any>,
    };

    let applyResources: TransactionService['applyResources'];

    beforeEach(async () => {
      const service = await container.get(TransactionService);
      applyResources = service['applyResources'];
      applyResources = applyResources.bind(service);
    });

    afterEach(() => {
      (universalResourceAction.handle as jest.Mock).mockReset();
      (universalResourceActionWithTimeout.handle as jest.Mock).mockReset();
    });

    it('should return empty transaction if diffs is empty', async () => {
      const result = await applyResources([]);

      expect(result).toEqual([]);
    });

    it('should skip processing diffs that are already applied', async () => {
      (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue();
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);

      const diff = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
      const diffMetadata = new DiffMetadata(diff, [universalResourceAction]);
      diffMetadata.applied = true;
      diffMetadata.applyOrder = 0;

      const result = await applyResources([diffMetadata]);

      expect(result).toEqual([[]]);
    });

    it('should only process 1 matching diff when duplicates found', async () => {
      (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue();
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);

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
      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
        ]);

      const diff1 = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
      const diffMetadata1 = new DiffMetadata(diff1, [universalResourceAction]);
      diffMetadata1.applyOrder = 0;
      const diff2 = new Diff(resource2, DiffAction.ADD, 'resourceId', 'resource-2');
      const diffMetadata2 = new DiffMetadata(diff2, [universalResourceAction]);
      diffMetadata2.applyOrder = 1;

      const result = await applyResources([diffMetadata2, diffMetadata1]);

      expect(result).toMatchSnapshot();
    });

    describe('when resource action throws error', () => {
      it('should throw transaction error and persist error properties', async () => {
        const customError = new Error('error!');
        (universalResourceAction.handle as jest.Mocked<any>).mockRejectedValue(customError);
        const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
          await createTestResources([
            { resourceContext: '@octo/test-resource=resource-1' },
            { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
          ]);

        const diff1 = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
        const diffMetadata1 = new DiffMetadata(diff1, [universalResourceAction]);
        diffMetadata1.applyOrder = 0;
        const diff2 = new Diff(resource2, DiffAction.ADD, 'resourceId', 'resource-2');
        const diffMetadata2 = new DiffMetadata(diff2, [universalResourceAction]);
        diffMetadata2.applyOrder = 1;

        await expect(async () => {
          await applyResources([diffMetadata2, diffMetadata1]);
        }).rejects.toThrow(customError);

        try {
          await applyResources([diffMetadata2, diffMetadata1]);
        } catch (error) {
          expect(error instanceof ResourceActionExceptionTransactionError).toBe(true);
        }
      });
    });

    describe('with actionTimeoutInMs', () => {
      it('should throw error if action does not resolve in time', async () => {
        (universalResourceActionWithTimeout.handle as jest.Mocked<any>).mockImplementationOnce(
          async (): Promise<void> => {
            await new Promise((resolve) => setTimeout(resolve, 200));
          },
        );

        const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
          await createTestResources([
            { resourceContext: '@octo/test-resource=resource-1' },
            { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
          ]);

        const diff1 = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
        const diffMetadata1 = new DiffMetadata(diff1, [universalResourceActionWithTimeout]);
        diffMetadata1.applyOrder = 0;
        const diff2 = new Diff(resource2, DiffAction.ADD, 'resourceId', 'resource-2');
        const diffMetadata2 = new DiffMetadata(diff2, [universalResourceAction]);
        diffMetadata2.applyOrder = 1;

        await expect(async () => {
          await applyResources([diffMetadata2, diffMetadata1]);
        }).rejects.toThrowErrorMatchingInlineSnapshot(`"Resource action Object timed out after 100ms!"`);

        expect(universalResourceAction.handle).toHaveBeenCalledTimes(0);
      });

      it('should process diffs if action resolves in time', async () => {
        (universalResourceActionWithTimeout.handle as jest.Mocked<any>).mockImplementationOnce(
          async (): Promise<void> => {
            await new Promise((resolve) => setTimeout(resolve, 10));
          },
        );

        const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
          await createTestResources([
            { resourceContext: '@octo/test-resource=resource-1' },
            { parents: ['@octo/test-resource=resource-1'], resourceContext: '@octo/test-resource=resource-2' },
          ]);

        const diff1 = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
        const diffMetadata1 = new DiffMetadata(diff1, [universalResourceActionWithTimeout]);
        diffMetadata1.applyOrder = 0;
        const diff2 = new Diff(resource2, DiffAction.ADD, 'resourceId', 'resource-2');
        const diffMetadata2 = new DiffMetadata(diff2, [universalResourceAction]);
        diffMetadata2.applyOrder = 1;

        await applyResources([diffMetadata2, diffMetadata1]);

        expect(universalResourceActionWithTimeout.handle).toHaveBeenCalledTimes(1);
        expect(universalResourceAction.handle).toHaveBeenCalledTimes(1);
      });
    });

    describe('with skipActualResourceUpdate', () => {
      it('should run the action but not maintain the actual resource graph', async () => {
        (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue();
        const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
        ]);
        const resourceDataRepository = await container.get(ResourceDataRepository);

        const diff = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
        const diffMetadata = new DiffMetadata(diff, [universalResourceAction]);
        diffMetadata.applyOrder = 0;

        await applyResources([diffMetadata], { skipActualResourceUpdate: true });

        // The action ran (terraform invoked octo for this resource) ...
        expect(universalResourceAction.handle).toHaveBeenCalledTimes(1);
        // ... but octo stayed stateless: terraform owns the actual state until the next commit.
        expect(resourceDataRepository.getActualResourcesByProperties()).toEqual([]);
      });

      it('should maintain the actual resource graph by default', async () => {
        (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue();
        const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
        ]);
        const resourceDataRepository = await container.get(ResourceDataRepository);

        const diff = new Diff(resource1, DiffAction.ADD, 'resourceId', 'resource-1');
        const diffMetadata = new DiffMetadata(diff, [universalResourceAction]);
        diffMetadata.applyOrder = 0;

        await applyResources([diffMetadata]);

        expect(resourceDataRepository.getActualResourcesByProperties().map((r) => r.resourceId)).toEqual([
          'resource-1',
        ]);
      });
    });
  });

  describe('generateTerraform()', () => {
    let generateTerraform: TransactionService['generateTerraform'];

    beforeEach(async () => {
      const service = await container.get(TransactionService);
      generateTerraform = service['generateTerraform'].bind(service);
    });

    it('should route terraform resources through toHCL() and external resources through the external wrapper', async () => {
      const terraformService = await container.get(TerraformService);
      const { '@octo/test-tf-resource=vpc-1': vpc } = await testModuleContainer.createTestResources('region-module', [
        { resourceContext: '@octo/test-tf-resource=vpc-1', terraform: true },
        { parents: ['@octo/test-tf-resource=vpc-1'], resourceContext: '@octo/test-external-resource=igw-1' },
      ]);
      const toHCLSpy = jest.spyOn(vpc as any, 'toHCL');

      await generateTerraform();

      // The terraform resource is contributed via toHCL().
      expect(toHCLSpy).toHaveBeenCalledTimes(1);

      const mappings = terraformService.getOctoTerraformResourceMappings();
      const vpcMapping = mappings.find((m) => m.resourceId === 'vpc-1')!;
      expect(vpcMapping.moduleId).toBe('region-module');
      // The external resource is wrapped: its lifecycle runs through a generated null_resource.
      const igwMapping = mappings.find((m) => m.resourceId === 'igw-1')!;
      expect(igwMapping.moduleId).toBe('region-module');
      expect(igwMapping.terraformAddresses.some((a) => a.startsWith('null_resource.'))).toBe(true);
    });

    it('should reset prior contributions so a re-run over the same graph does not throw', async () => {
      const terraformService = await container.get(TerraformService);
      await testModuleContainer.createTestResources('region-module', [
        { resourceContext: '@octo/test-tf-resource=vpc-1', terraform: true },
      ]);

      await generateTerraform();
      // Without reset() the duplicate registration would throw; the sweep must be repeatable.
      await expect(generateTerraform()).resolves.not.toThrow();

      expect(terraformService.getOctoTerraformResourceMappings().filter((m) => m.resourceId === 'vpc-1')).toHaveLength(
        1,
      );
    });

    it('should skip resources marked for deletion', async () => {
      const terraformService = await container.get(TerraformService);
      const { '@octo/test-external-resource=igw-1': igw } = await testModuleContainer.createTestResources(
        'region-module',
        [
          { resourceContext: '@octo/test-tf-resource=vpc-1', terraform: true },
          { parents: ['@octo/test-tf-resource=vpc-1'], resourceContext: '@octo/test-external-resource=igw-1' },
        ],
      );
      igw.remove();

      await generateTerraform();

      const mappings = terraformService.getOctoTerraformResourceMappings();
      expect(mappings.some((m) => m.resourceId === 'igw-1')).toBe(false);
      expect(mappings.some((m) => m.resourceId === 'vpc-1')).toBe(true);
    });

    it('should throw when a resource is not attributed to any module', async () => {
      // Added straight to the repository, bypassing module registration.
      await createTestResources([{ resourceContext: '@octo/test-resource=orphan-1' }]);

      await expect(generateTerraform()).rejects.toThrow('Resource "orphan-1" is not associated with any module!');
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
    describe('enableResourceValidation', () => {
      const universalResourceAction: IResourceAction<UnknownResource> = {
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };

      afterEach(() => {
        (universalResourceAction.handle as jest.Mock).mockReset();
      });

      it('should generate validation diffs', async () => {
        await createTestResources([
          { resourceActions: [universalResourceAction], resourceContext: '@octo/test-resource=resource-1' },
        ]);
        await commitResources();

        // Recreate resource-1
        // Since after commitResources() new resources are empty,
        // so we need to just add resource-1 again in order to generate diffs.
        await createTestResources([
          { resourceActions: [universalResourceAction], resourceContext: '@octo/test-resource=resource-1' },
        ]);

        const service = await container.get(TransactionService);
        const generator = service.beginTransaction([], { enableResourceValidation: true, yieldResourceDiffs: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });

    describe('filterResourceDiffsByResourceId', () => {
      const universalResourceAction: IResourceAction<UnknownResource> = {
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };

      afterEach(() => {
        (universalResourceAction.handle as jest.Mock).mockReset();
      });

      it('should scope the transaction to only the targeted resource', async () => {
        await createTestResources([
          { resourceActions: [universalResourceAction], resourceContext: '@octo/test-resource=resource-1' },
          { resourceActions: [universalResourceAction], resourceContext: '@octo/test-resource=resource-2' },
        ]);

        const service = await container.get(TransactionService);
        const generator = service.beginTransaction([], {
          filterResourceDiffsByResourceId: 'resource-2',
          yieldResourceDiffs: true,
        });
        const [newGroup, dirtyGroup] = (await generator.next()).value as DiffMetadata[][];

        const targeted = [...newGroup, ...dirtyGroup].map((d) => (d.node as UnknownResource).resourceId);
        expect(targeted).toEqual(['resource-2']);
      });

      it('should prefer the mutable actual-graph diff over the frozen old-graph diff for a delete', async () => {
        (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue();

        // Apply resource-1 so it lands in both the old graph (frozen on reload) and the actual graph.
        await createTestResources([
          { resourceActions: [universalResourceAction], resourceContext: '@octo/test-resource=resource-1' },
        ]);
        const service = await container.get(TransactionService);
        await service.beginTransaction([]).next();
        await commitResources({ skipAddActualResource: true });

        // resource-1 is no longer desired: a delete that appears as both a new diff (old-graph node,
        // frozen) and a dirty diff (actual-graph node, mutable).
        const generator = service.beginTransaction([], {
          filterResourceDiffsByResourceId: 'resource-1',
          yieldResourceDiffs: true,
        });
        const [newGroup, dirtyGroup] = (await generator.next()).value as DiffMetadata[][];

        // The frozen old-graph diff is dropped in preference of the mutable actual-graph diff, which
        // is the one run-action can inject inputs into.
        expect(newGroup).toHaveLength(0);
        expect(dirtyGroup.map((d) => (d.node as UnknownResource).resourceId)).toEqual(['resource-1']);

        const resourceDataRepository = await container.get(ResourceDataRepository);
        expect(dirtyGroup[0].node).toBe(
          resourceDataRepository.getActualResourceByContext('@octo/test-resource=resource-1'),
        );
        expect(Object.isFrozen(dirtyGroup[0].node)).toBe(false);
      });
    });

    describe('generateTerraform', () => {
      it('should contribute the desired graph and back terraform-resource diffs with a no-op action', async () => {
        const terraformService = await container.get(TerraformService);
        await testModuleContainer.createTestResources('region-module', [
          { resourceContext: '@octo/test-tf-resource=vpc-1', terraform: true },
          { parents: ['@octo/test-tf-resource=vpc-1'], resourceContext: '@octo/test-external-resource=igw-1' },
        ]);

        const service = await container.get(TransactionService);
        const generator = service.beginTransaction([], { generateTerraform: true, yieldResourceDiffs: true });
        const [newGroup] = (await generator.next()).value as DiffMetadata[][];

        // The full desired state was contributed to terraform.
        expect(
          terraformService
            .getOctoTerraformResourceMappings()
            .map((m) => m.resourceId)
            .sort(),
        ).toEqual(['igw-1', 'vpc-1']);

        // Terraform owns the terraform resource's lifecycle, so its diff carries the internal
        // no-op action; the external resource keeps its real action.
        const vpcDiff = newGroup.find((d) => (d.node as UnknownResource).resourceId === 'vpc-1')!;
        const igwDiff = newGroup.find((d) => (d.node as UnknownResource).resourceId === 'igw-1')!;
        expect(vpcDiff.actions.map((a: any) => a.constructor.name)).toEqual(['TerraformNoopResourceAction']);
        expect(igwDiff.actions.map((a: any) => a.constructor.name)).toEqual(['UniversalResourceAction']);
      });
    });

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

        await createTestOverlays([
          { anchors: [anchor1], context: '@octo/test-overlay=overlay-1', overlayActions: [universalModelAction] },
        ]);

        const service = await container.get(TransactionService);
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

        const { 'moduleId.model.app': app } = await testModuleContainer.runModule({
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

        const { 'moduleId.model.app': app } = await testModuleContainer.runModule({
          inputs: { name: 'app' },
          moduleId: 'moduleId',
          type: TestAppModule,
        });
        const anchor1 = new TestAnchor('anchor-1', {}, app);
        app.addAnchor(anchor1);

        await testModuleContainer.runModule({
          inputs: { anchorName: 'anchor-1', app: stub('${{moduleId.model.app}}') },
          moduleId: 'overlayModuleId',
          type: TestAppOverlayModule,
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
      };

      afterEach(() => {
        (universalResourceAction.handle as jest.Mock).mockReset();
      });

      it('should yield resource diffs', async () => {
        await createTestResources([
          { resourceActions: [universalResourceAction], resourceContext: '@octo/test-resource=resource-1' },
        ]);
        await commitResources();

        // Replace resource1 with resource2.
        // Since after commitResources() new resources are empty,
        // so we need to just add resource-2 in order to replace resource-1.
        await createTestResources([
          { resourceActions: [universalResourceAction], resourceContext: '@octo/test-resource=resource-2' },
        ]);

        const service = await container.get(TransactionService);
        const generator = service.beginTransaction([], { yieldResourceDiffs: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });

    describe('yieldResourceTransaction', () => {
      const universalResourceAction: IResourceAction<UnknownResource> = {
        filter: () => true,
        handle: jest.fn() as jest.Mocked<any>,
      };

      afterEach(() => {
        (universalResourceAction.handle as jest.Mock).mockReset();
      });

      it('should yield resource transaction', async () => {
        (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue();

        await createTestResources([
          { resourceActions: [universalResourceAction], resourceContext: '@octo/test-resource=resource-1' },
        ]);
        await commitResources();

        // Replace resource1 with resource2.
        // Since after commitResources() new resources are empty,
        // so we need to just add resource-2 in order to replace resource-1.
        await createTestResources([
          { resourceActions: [universalResourceAction], resourceContext: '@octo/test-resource=resource-2' },
        ]);

        const service = await container.get(TransactionService);
        const generator = service.beginTransaction([], { yieldResourceTransaction: true });

        const result = await generator.next();

        expect(result.value).toMatchSnapshot();
      });
    });
  });

  describe('registerResourceActions()', () => {
    it('should throw when called with a terraform resource class', async () => {
      const service = await container.get(TransactionService);
      const TerraformResource = createTerraformResource('test-tf-resource');
      Object.defineProperty(TerraformResource, 'name', { value: 'TestTerraformResource' });

      expect(() => service.registerResourceActions(TerraformResource, [])).toThrow(
        'Cannot register resource actions for terraform resource "TestTerraformResource"!',
      );
    });
  });
});
