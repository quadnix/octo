import { jest } from '@jest/globals';
import { MatchingResource, type UnknownModel, type UnknownModule, type UnknownResource, stub } from '../../app.type.js';
import { Resource } from '../../decorators/resource.decorator.js';
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
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { BaseResourceSchema } from '../../resources/resource.schema.js';
import { TestOverlay, TestResourceAction } from '../../utilities/test-helpers/test-classes.js';
import { create } from '../../utilities/test-helpers/test-models.js';
import { createAppModule, createAppOverlayModule, runModule } from '../../utilities/test-helpers/test-modules.js';
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
      const { 'moduleId.model.app': app } = await runModule(container, {
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
      const { 'moduleId.model.app': app } = await runModule(container, {
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

      const { 'moduleId.model.app': app } = await runModule(container, {
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

      const { 'moduleId.model.app': app } = await runModule(container, {
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

      const { 'moduleId.model.app': app } = await runModule(container, {
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

      const { 'moduleId.model.app': app } = await runModule(container, {
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

    it('should throw when two actions create resources with the same scope and resource id', async () => {
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValueOnce({
        resource1: new TestResource('resource1'),
      });
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValueOnce({
        resource1: new TestResource('resource1'),
      });

      const { 'moduleId.model.app': app } = await runModule(container, {
        inputs: { name: 'app' },
        moduleId: 'moduleId',
        type: TestAppModule,
      });

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [universalModelAction, universalModelAction]);
      diffMetadata.applyOrder = 0;

      await expect(applyModels([diffMetadata])).rejects.toThrow(
        'Resource "@octo/test-resource=resource1" already exists, and action "Object" created it again!',
      );
    });

    it('should accept the same resource returned by two actions', async () => {
      const resource1 = new TestResource('resource1');
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValueOnce({ resource1 });
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValueOnce({ resource1 });

      const { 'moduleId.model.app': app } = await runModule(container, {
        inputs: { name: 'app' },
        moduleId: 'moduleId',
        type: TestAppModule,
      });

      const diff = new Diff(app, DiffAction.ADD, 'name', 'app');
      const diffMetadata = new DiffMetadata(diff, [universalModelAction, universalModelAction]);
      diffMetadata.applyOrder = 0;

      await applyModels([diffMetadata]);

      const resourceDataRepository = await container.get(ResourceDataRepository);
      expect(resourceDataRepository.getNewResourceByContext('@octo/test-resource=resource1')).toBe(resource1);
    });

    it('should file and tag a resource only under the module whose action created it', async () => {
      const resource1 = new TestResource('resource1');
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({ resource1 });

      const { 'moduleId.model.app': app } = await runModule(container, {
        inputs: { name: 'app' },
        moduleId: 'moduleId',
        type: TestAppModule,
      });
      app.addAnchor(new TestAnchor('anchor-1', {}, app));
      await runModule(container, {
        inputs: { anchorName: 'anchor-1', app: stub('${{moduleId.model.app}}') },
        moduleId: 'overlayModuleId',
        type: TestAppOverlayModule,
      });
      const inputService = await container.get(InputService);
      inputService.registerTag({ moduleId: 'moduleId' }, { owner: 'app' });
      inputService.registerTag({ moduleId: 'overlayModuleId' }, { changedBy: 'overlay' });
      const overlay = (await container.get(OverlayDataRepository)).getByContext('@octo/test-overlay=test-overlay')!;

      const appDiffMetadata = new DiffMetadata(new Diff(app, DiffAction.ADD, 'name', 'app'), [universalModelAction]);
      appDiffMetadata.applyOrder = 0;
      const overlayDiffMetadata = new DiffMetadata(new Diff(overlay, DiffAction.ADD, 'overlayId', 'test-overlay'), [
        universalModelAction,
      ]);
      overlayDiffMetadata.applyOrder = 1;

      await applyModels([appDiffMetadata, overlayDiffMetadata]);

      expect(inputService.getModuleIdFromResource(resource1)).toBe('moduleId');
      expect(inputService.getModuleResources('overlayModuleId')).toEqual([]);
      expect(resource1.tags).toEqual({ owner: 'app' });
    });

    it('should record every model and overlay whose action produced a resource, and the one that created it', async () => {
      const resource1 = new TestResource('resource1');
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({ resource1 });

      const { 'moduleId.model.app': app } = await runModule(container, {
        inputs: { name: 'app' },
        moduleId: 'moduleId',
        type: TestAppModule,
      });
      app.addAnchor(new TestAnchor('anchor-1', {}, app));
      await runModule(container, {
        inputs: { anchorName: 'anchor-1', app: stub('${{moduleId.model.app}}') },
        moduleId: 'overlayModuleId',
        type: TestAppOverlayModule,
      });
      const overlay = (await container.get(OverlayDataRepository)).getByContext('@octo/test-overlay=test-overlay')!;

      const appDiffMetadata = new DiffMetadata(new Diff(app, DiffAction.ADD, 'name', 'app'), [universalModelAction]);
      appDiffMetadata.applyOrder = 0;
      const overlayDiffMetadata = new DiffMetadata(new Diff(overlay, DiffAction.ADD, 'overlayId', 'test-overlay'), [
        universalModelAction,
      ]);
      overlayDiffMetadata.applyOrder = 1;

      await applyModels([appDiffMetadata, overlayDiffMetadata]);

      const inputService = await container.get(InputService);
      expect(inputService.getModelsFromResource(resource1)).toEqual(['@octo/test-overlay=test-overlay', 'app=app']);
      expect(inputService.getCreatorFromResource(resource1)).toBe('app=app');
    });

    it('should process diffs in different levels', async () => {
      (universalModelAction.handle as jest.Mocked<any>).mockResolvedValue({});

      const { 'moduleId.model.app': app } = await runModule(container, {
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
    const universalResourceAction = new TestResourceAction(jest.fn() as jest.Mocked<any>);
    const universalResourceActionWithTimeout = new TestResourceAction(jest.fn() as jest.Mocked<any>, 100);

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
        }).rejects.toThrowErrorMatchingInlineSnapshot(`"Resource action TestResourceAction timed out after 100ms!"`);

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

    describe('when an existing resource gains a parent', () => {
      let setApplyOrder: TransactionService['setApplyOrder'];

      beforeEach(async () => {
        const service = await container.get(TransactionService);
        setApplyOrder = service['setApplyOrder'].bind(service);
      });

      /**
       * A child that already exists has no ADD of its own - only an `ADD 'parent'`. Applying it
       * de-references the new parent out of the *actual* resource graph, where it only appears once
       * its own diff has been applied.
       */
      const createChildGainingAParent = async (): Promise<{
        child: UnknownResource;
        childGainsParentDiff: Diff;
        parent: UnknownResource;
        parentAddDiff: Diff;
      }> => {
        // Saved, so it is in the actual graph already: this is the "already exists" half.
        const { '@octo/test-resource=resource-1': child } = await createTestResources(
          [{ resourceContext: '@octo/test-resource=resource-1' }],
          { save: true },
        );
        // Not saved: the parent is in the desired graph only, and is added by this transaction.
        const { '@octo/test-resource=resource-2': parent } = await createTestResources([
          { resourceContext: '@octo/test-resource=resource-2' },
        ]);
        parent.addChild('resourceId', child, 'resourceId');

        return {
          child,
          childGainsParentDiff: new Diff(child, DiffAction.ADD, 'parent', parent),
          parent,
          parentAddDiff: new Diff(parent, DiffAction.ADD, 'resourceId', 'resource-2'),
        };
      };

      it('should order the parent-add before the child that gains it', async () => {
        const { childGainsParentDiff, parentAddDiff } = await createChildGainingAParent();

        const diffsMetadata = [childGainsParentDiff, parentAddDiff].map(
          (d) => new DiffMetadata(d, [universalResourceAction]),
        );
        setApplyOrder(diffsMetadata[0], diffsMetadata);

        expect(diffsMetadata[0].applyOrder).toBe(1);
        expect(diffsMetadata[1].applyOrder).toBe(0);
      });

      it('should apply the parent-add and wire it into the actual graph', async () => {
        (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue();
        const { childGainsParentDiff, parentAddDiff } = await createChildGainingAParent();
        const resourceDataRepository = await container.get(ResourceDataRepository);

        // Deliberately listed child-first: ordering must come from the dependency graph, not the
        // order the diffs happen to arrive in.
        const diffsMetadata = [childGainsParentDiff, parentAddDiff].map(
          (d) => new DiffMetadata(d, [universalResourceAction]),
        );
        for (const diffMetadata of diffsMetadata) {
          setApplyOrder(diffMetadata, diffsMetadata);
        }

        await applyResources(diffsMetadata);

        const actualChild = resourceDataRepository.getActualResourceByContext('@octo/test-resource=resource-1')!;
        expect(
          actualChild.parents.map((p) => (p instanceof MatchingResource ? p.getActual() : p).getContext()),
        ).toEqual(['@octo/test-resource=resource-2']);
      });

      it('should name the missing resource when the parent is never applied', async () => {
        (universalResourceAction.handle as jest.Mocked<any>).mockResolvedValue();
        const { childGainsParentDiff } = await createChildGainingAParent();

        // The parent's own diff is withheld, so it never reaches the actual graph.
        const diffMetadata = new DiffMetadata(childGainsParentDiff, [universalResourceAction]);
        diffMetadata.applyOrder = 0;

        await expect(applyResources([diffMetadata])).rejects.toThrow(
          'Cannot apply "add" on field "parent" of resource "@octo/test-resource=resource-1": it references ' +
            '"@octo/test-resource=resource-2", which is not in the actual resource graph yet. The referenced ' +
            'resource is applied later in this transaction, or not at all.',
        );
      });
    });
  });

  describe('ensureUniqueNames()', () => {
    const TestTable = createResource('test-table').setClassName('TestTable');
    Object.assign(TestTable, {
      UNIQUE_PROPERTIES: [
        { path: 'tableName', within: ['accountId', 'regionId'] },
        { path: 'policies[].name', within: ['accountId'] },
        { path: 'bucketName', within: [] },
      ],
    });

    let ensureUniqueNames: TransactionService['ensureUniqueNames'];
    let inputService: InputService;

    const createTable = (
      moduleId: string,
      resourceId: string,
      properties: Record<string, unknown>,
    ): UnknownResource => {
      const table = new TestTable(resourceId, properties);
      inputService.registerResource(moduleId, table);
      return table;
    };

    beforeEach(async () => {
      const service = await container.get(TransactionService);
      ensureUniqueNames = service['ensureUniqueNames'].bind(service);
      inputService = await container.get(InputService);
    });

    it('should throw error when two tables in one region share a name', () => {
      const tables = [
        createTable('module-1', 'table-1', { accountId: '123', regionId: 'us-east-1', tableName: 'accounts' }),
        createTable('module-2', 'table-2', { accountId: '123', regionId: 'us-east-1', tableName: 'accounts' }),
      ];

      expect(() => ensureUniqueNames(tables)).toThrowErrorMatchingInlineSnapshot(
        `""tableName" "accounts" is not unique within accountId, regionId: resource "@octo/test-table=table-1" of module "module-1" and resource "@octo/test-table=table-2" of module "module-2" both use it!"`,
      );
    });

    it('should throw error when two policies of one resource share a name', () => {
      const tables = [
        createTable('module-1', 'table-1', {
          accountId: '123',
          policies: [{ name: 'read' }, { name: 'read' }],
          regionId: 'us-east-1',
        }),
      ];

      expect(() => ensureUniqueNames(tables)).toThrowErrorMatchingInlineSnapshot(
        `""policies[].name" "read" is not unique within accountId: resource "@octo/test-table=table-1" of module "module-1" and resource "@octo/test-table=table-1" of module "module-1" both use it!"`,
      );
    });

    it('should throw error when two policies in two regions of one account share a name', () => {
      const tables = [
        createTable('module-1', 'table-1', { accountId: '123', policies: [{ name: 'read' }], regionId: 'us-east-1' }),
        createTable('module-2', 'table-2', { accountId: '123', policies: [{ name: 'read' }], regionId: 'us-west-2' }),
      ];

      expect(() => ensureUniqueNames(tables)).toThrow('"policies[].name" "read" is not unique within accountId');
    });

    it('should throw error when two resources in two accounts share a name unique across the app', () => {
      const tables = [
        createTable('module-1', 'table-1', { bucketName: 'receipts' }),
        createTable('module-2', 'table-2', { bucketName: 'receipts' }),
      ];

      expect(() => ensureUniqueNames(tables)).toThrow('"bucketName" "receipts" is not unique across the app');
    });

    it('should throw error when a named resource is missing a domain value', () => {
      const tables = [createTable('module-1', 'table-1', { accountId: '123', tableName: 'accounts' })];

      expect(() => ensureUniqueNames(tables)).toThrowErrorMatchingInlineSnapshot(
        `"resource "@octo/test-table=table-1" of module "module-1" has no "regionId", which its "tableName" is unique within!"`,
      );
    });

    it('should pass two tables of one name in two regions', () => {
      const tables = [
        createTable('module-1', 'table-1', { accountId: '123', regionId: 'us-east-1', tableName: 'accounts' }),
        createTable('module-2', 'table-2', { accountId: '123', regionId: 'us-west-2', tableName: 'accounts' }),
      ];

      expect(() => ensureUniqueNames(tables)).not.toThrow();
    });

    it('should pass a resource with no name, without asking for its domain', () => {
      const tables = [
        createTable('module-1', 'table-1', {}),
        createTable('module-2', 'table-2', { accountId: '123', policies: [], regionId: 'us-east-1' }),
      ];

      expect(() => ensureUniqueNames(tables)).not.toThrow();
    });

    it('should not compare resources of two classes', () => {
      const OtherTable = createResource('other-table').setClassName('OtherTable');
      Object.assign(OtherTable, { UNIQUE_PROPERTIES: [{ path: 'tableName', within: ['accountId', 'regionId'] }] });
      const otherTable = new OtherTable('table-2', { accountId: '123', regionId: 'us-east-1', tableName: 'accounts' });
      inputService.registerResource('module-2', otherTable);
      const tables = [
        createTable('module-1', 'table-1', { accountId: '123', regionId: 'us-east-1', tableName: 'accounts' }),
        otherTable,
      ];

      expect(() => ensureUniqueNames(tables)).not.toThrow();
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

    it('should require an explicit reset() to re-sweep the same graph', async () => {
      const terraformService = await container.get(TerraformService);
      await testModuleContainer.createTestResources('region-module', [
        { resourceContext: '@octo/test-tf-resource=vpc-1', terraform: true },
      ]);

      await generateTerraform();
      // The sweep no longer self-resets, so re-sweeping without a reset re-registers and throws.
      await expect(generateTerraform()).rejects.toThrow('Resource id "vpc-1" is already registered!');

      // reset() clears prior contributions, so a fresh run (which resets at its boundary) is repeatable.
      terraformService.reset();
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
      const resourceDataRepository = await container.get(ResourceDataRepository);
      resourceDataRepository.addNewResource(new TestResource('orphan-1'));

      await expect(generateTerraform()).rejects.toThrow('Resource "orphan-1" is not associated with any module!');
    });

    it('should throw error when two resources share a unique property declared through @Resource', async () => {
      const TestTable = createResource('test-table').setClassName('TestTable');
      Resource<UnknownResource>('@octo', 'test-table', BaseResourceSchema, {
        uniqueProperties: [{ path: 'tableName', within: ['regionId'] }],
      })(TestTable);
      const [inputService, resourceDataRepository] = await Promise.all([
        container.get(InputService),
        container.get(ResourceDataRepository),
      ]);
      for (const [moduleId, resourceId] of [
        ['module-1', 'table-1'],
        ['module-2', 'table-2'],
      ]) {
        const table = new TestTable(resourceId, { regionId: 'us-east-1', tableName: 'accounts' });
        resourceDataRepository.addNewResource(table);
        inputService.registerResource(moduleId, table);
      }

      await expect(generateTerraform()).rejects.toThrow('"tableName" "accounts" is not unique within regionId');
    });
  });

  describe('getResourceScope()', () => {
    let getResourceScope: TransactionService['getResourceScope'];

    beforeEach(async () => {
      const service = await container.get(TransactionService);
      getResourceScope = service['getResourceScope'].bind(service);
    });

    it('should scope a model to the models it sits under', () => {
      const {
        region: [region],
        subnet: [subnet],
      } = create({ account: ['aws,account'], app: ['test'], region: ['region-1'], subnet: ['subnet-1'] });

      expect(getResourceScope(subnet)).toEqual([region.getContext()]);
    });

    it('should scope a model with several parents to each parent no other parent sits under', () => {
      const {
        deployment: [deployment],
        environment: [environment],
        execution: [execution],
        subnet: [subnet],
      } = create({
        account: ['aws,account'],
        app: ['test'],
        deployment: ['v1'],
        environment: ['qa'],
        execution: [':0:0:0'],
        region: ['region-1'],
        server: ['backend'],
        subnet: ['subnet-1'],
      });

      expect(getResourceScope(execution)).toEqual(
        [deployment.getContext(), environment.getContext(), subnet.getContext()].sort(),
      );
    });

    it('should scope an overlay to what the models its own module created sit under', async () => {
      const inputService = await container.get(InputService);
      const {
        region: [region1, region2],
        subnet: [subnet2],
      } = create({
        account: ['aws,account-1', 'aws,account-2:-1'],
        app: ['test'],
        region: ['region-1', 'region-2'],
        subnet: ['subnet-2:1'],
      });
      const overlay = new TestOverlay('overlay-1', {}, [
        new TestAnchor('anchor-1', {}, region1),
        new TestAnchor('anchor-2', {}, subnet2),
      ]);
      inputService.registerModel('module-1', region1);
      inputService.registerModel('module-2', subnet2);
      inputService.registerOverlay('module-2', overlay);

      expect(getResourceScope(overlay)).toEqual([region2.getContext()]);
    });

    it('should not move the scope of an overlay when it joins one more model of another module', async () => {
      const inputService = await container.get(InputService);
      const {
        region: [region1, region2],
        subnet: [subnet1],
      } = create({
        account: ['aws,account-1', 'aws,account-2:-1'],
        app: ['test'],
        region: ['region-1', 'region-2'],
        subnet: ['subnet-1'],
      });
      const overlay = new TestOverlay('overlay-1', {}, [new TestAnchor('anchor-1', {}, subnet1)]);
      inputService.registerModel('module-1', subnet1);
      inputService.registerModel('module-2', region2);
      inputService.registerOverlay('module-1', overlay);
      const scopeBefore = getResourceScope(overlay);

      overlay.addAnchor(new TestAnchor('anchor-2', {}, region2));

      expect(getResourceScope(overlay)).toEqual(scopeBefore);
      expect(scopeBefore).toEqual([region1.getContext()]);
    });

    it('should scope an overlay that joins no model of its own module to what every model it joins sits under', async () => {
      const inputService = await container.get(InputService);
      const {
        account: [account1],
        region: [region1, region2],
        subnet: [subnet2],
      } = create({
        account: ['aws,account-1', 'aws,account-2:-1'],
        app: ['test'],
        region: ['region-1', 'region-2'],
        subnet: ['subnet-2:1'],
      });
      const overlay = new TestOverlay('overlay-1', {}, [
        new TestAnchor('anchor-1', {}, region1),
        new TestAnchor('anchor-2', {}, subnet2),
      ]);
      inputService.registerModel('module-1', region1);
      inputService.registerModel('module-2', subnet2);
      inputService.registerOverlay('module-3', overlay);

      expect(getResourceScope(overlay)).toEqual([account1.getContext(), region2.getContext()].sort());
    });

    it('should scope an overlay joining an overlay of its own module to where that overlay sits', async () => {
      const inputService = await container.get(InputService);
      const {
        region: [region],
        subnet: [subnet],
      } = create({ account: ['aws,account'], app: ['test'], region: ['region-1'], subnet: ['subnet-1'] });
      const innerOverlay = new TestOverlay('overlay-1', {}, [new TestAnchor('anchor-1', {}, subnet)]);
      const outerOverlay = new TestOverlay('overlay-2', {}, [new TestAnchor('anchor-2', {}, innerOverlay)]);
      inputService.registerModel('module-1', subnet);
      inputService.registerOverlay('module-1', innerOverlay);
      inputService.registerOverlay('module-1', outerOverlay);

      expect(getResourceScope(outerOverlay)).toEqual([region.getContext()]);
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
      const universalResourceAction = new TestResourceAction(jest.fn() as jest.Mocked<any>);

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
      const universalResourceAction = new TestResourceAction(jest.fn() as jest.Mocked<any>);

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
        expect(igwDiff.actions.map((a: any) => a.constructor.name)).toEqual([
          'UniversalResourceActionFortest-external-resource',
        ]);
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

        const { 'moduleId.model.app': app } = await runModule(container, {
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

        const { 'moduleId.model.app': app } = await runModule(container, {
          inputs: { name: 'app' },
          moduleId: 'moduleId',
          type: TestAppModule,
        });
        const anchor1 = new TestAnchor('anchor-1', {}, app);
        app.addAnchor(anchor1);

        await runModule(container, {
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
      const universalResourceAction = new TestResourceAction(jest.fn() as jest.Mocked<any>);

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
      const universalResourceAction = new TestResourceAction(jest.fn() as jest.Mocked<any>);

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
