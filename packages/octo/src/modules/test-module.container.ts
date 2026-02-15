import type {
  ActionOutputs,
  Constructable,
  ModuleOutput,
  ModuleSchemaInputs,
  UnknownAnchor,
  UnknownModel,
  UnknownModule,
  UnknownOverlay,
  UnknownResource,
} from '../app.type.js';
import { Container } from '../functions/container/container.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { Octo } from '../main.js';
import type { App } from '../models/app/app.model.js';
import type { IModelAction } from '../models/model-action.interface.js';
import { AModel } from '../models/model.abstract.js';
import type { BaseAnchorSchema } from '../overlays/anchor.schema.js';
import { OverlayDataRepository, type OverlayDataRepositoryFactory } from '../overlays/overlay-data.repository.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import type { IResourceAction } from '../resources/resource-action.interface.js';
import { AResource } from '../resources/resource.abstract.js';
import type { BaseResourceSchema } from '../resources/resource.schema.js';
import { InputService, type InputServiceFactory } from '../services/input/input.service.js';
import { LocalEncryptionStateProvider } from '../services/state-management/local-encryption.state-provider.js';
import { LocalStateProvider } from '../services/state-management/local.state-provider.js';
import type { IStateProvider } from '../services/state-management/state-provider.interface.js';
import { TestStateProvider } from '../services/state-management/test.state-provider.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import { TestAnchor } from '../utilities/test-helpers/test-classes.js';
import { create } from '../utilities/test-helpers/test-models.js';
import { createTestOverlays } from '../utilities/test-helpers/test-overlays.js';
import { createResources, createTestResources } from '../utilities/test-helpers/test-resources.js';
import { AModule } from './module.abstract.js';
import { ModuleContainer } from './module.container.js';

// Universal Test Module and Actions.
class UniversalTestModuleSchema {}
class UniversalTestModule extends AModule<UniversalTestModuleSchema, any> {
  static override readonly MODULE_PACKAGE = '@octo';
  static override readonly MODULE_SCHEMA = UniversalTestModuleSchema;

  async onInit(): Promise<void> {
    return;
  }
}
class UniversalModelAction implements IModelAction<UniversalTestModule> {
  filter(): boolean {
    return true;
  }
  async handle(): Promise<ActionOutputs> {
    return {};
  }
}
class UniversalResourceAction implements IResourceAction<any> {
  filter(): boolean {
    return true;
  }
  async handle(): Promise<void> {}
  async mock(): Promise<void> {}
}

/**
 * @group Modules
 */
export type TestModule<M extends UnknownModule> = {
  hidden?: boolean;
  inputs: ModuleSchemaInputs<M>;
  moduleId: string;
  type: Constructable<M>;
};

/**
 * @group Modules
 */
export class TestModuleContainer {
  readonly octo: Octo;
  private stateProvider: IStateProvider;

  constructor() {
    this.octo = new Octo();
  }

  async commit(
    app: App,
    {
      enableResourceCapture = false,
      filterByModuleIds = [],
    }: { appLockId?: string; enableResourceCapture?: boolean; filterByModuleIds?: string[] } = {},
  ): Promise<{
    modelDiffs: DiffMetadata[][];
    modelTransaction: DiffMetadata[][];
    resourceDiffs: DiffMetadata[][];
    resourceTransaction: DiffMetadata[][];
  }> {
    const { lockId: appLockId } = await this.stateProvider.lockApp();

    const generator = this.octo.beginTransaction(app, {
      appLockId,
      enableResourceCapture,
      yieldModelDiffs: true,
      yieldModelTransaction: true,
      yieldResourceDiffs: true,
      yieldResourceTransaction: true,
    });

    const response = {} as Awaited<ReturnType<TestModuleContainer['commit']>>;

    try {
      response.modelDiffs = (await generator.next()).value;
      response.modelTransaction = (await generator.next()).value;
      response.resourceDiffs = (await generator.next()).value;
      response.resourceTransaction = (await generator.next()).value;
      await generator.next();
    } catch (error) {
      await this.reset();
      throw error;
    } finally {
      await this.stateProvider.unlockApp(appLockId);
    }

    const container = Container.getInstance();
    const inputService = await container.get(InputService);

    for (const moduleId of filterByModuleIds) {
      response.modelDiffs = response.modelDiffs
        .map((i) =>
          i.filter((j) => {
            if (j.node instanceof AModel && !(j.node instanceof AOverlay)) {
              return inputService.getModuleIdFromModel(j.node) === moduleId;
            } else if (j.node instanceof AOverlay) {
              return inputService.getModuleIdFromOverlay(j.node) === moduleId;
            } else {
              return false;
            }
          }),
        )
        .filter((i) => i.length);

      response.modelTransaction = response.modelTransaction
        .map((i) =>
          i.filter((j) => {
            if (j.node instanceof AModel && !(j.node instanceof AOverlay)) {
              return inputService.getModuleIdFromModel(j.node) === moduleId;
            } else if (j.node instanceof AOverlay) {
              return inputService.getModuleIdFromOverlay(j.node) === moduleId;
            } else {
              return false;
            }
          }),
        )
        .filter((i) => i.length);

      response.resourceDiffs = response.resourceDiffs
        .map((i) =>
          i.filter((j) => {
            if (j.node instanceof AResource) {
              return inputService.getModuleIdFromResource(j.node) === moduleId;
            } else {
              return false;
            }
          }),
        )
        .filter((i) => i.length);

      response.resourceTransaction = response.resourceTransaction
        .map((i) =>
          i.filter((j) => {
            if (j.node instanceof AResource) {
              return inputService.getModuleIdFromResource(j.node) === moduleId;
            } else {
              return false;
            }
          }),
        )
        .filter((i) => i.length);
    }

    await this.reset();

    return response;
  }

  createTestAnchor<S extends BaseAnchorSchema & { parentInstance: UnknownModel }>(
    anchorId: string,
    properties: S['properties'],
    parent: S['parentInstance'],
  ): UnknownAnchor {
    return new TestAnchor(anchorId, properties, parent);
  }

  async createTestModels(moduleId: string, args: Parameters<typeof create>[0]): Promise<ReturnType<typeof create>> {
    const container = Container.getInstance();
    const [inputService, moduleContainer, transactionService] = await Promise.all([
      container.get(InputService),
      container.get(ModuleContainer),
      container.get(TransactionService),
    ]);

    // Register new moduleId as instance of the universal module.
    moduleContainer.load(UniversalTestModule, moduleId, {});
    // Immediately unload the universal module to ensure it does not run in apply().
    moduleContainer.unload(UniversalTestModule);

    const result = create(args);
    for (const models of Object.values(result)) {
      // Check if the model has already been registered.
      // If no error thrown, the model has already been registered.
      for (const model of models) {
        try {
          inputService.getModuleIdFromModel(model);
          continue;
        } catch (error) {
          /* do nothing. */
        }

        inputService.registerModel(moduleId, model);

        const universalAction = new UniversalModelAction();
        Object.assign(universalAction, {
          constructor: { name: `${UniversalModelAction.name}For${model.constructor.name}` },
        });
        try {
          transactionService.unregisterModelActions(model.constructor as Constructable<UnknownModel>);
          transactionService.registerModelActions(model.constructor as Constructable<UnknownModel>, [universalAction]);
        } catch (error) {
          if (
            error.message !==
            `Action "${universalAction.constructor.name}" already registered for model "${model.constructor.name}"!`
          ) {
            throw error;
          }
        }
      }
    }

    return result;
  }

  async createTestOverlays(
    moduleId: string,
    args: Parameters<typeof createTestOverlays>[0],
  ): Promise<ReturnType<typeof createTestOverlays>> {
    const container = Container.getInstance();
    const [inputService, moduleContainer, transactionService] = await Promise.all([
      container.get(InputService),
      container.get(ModuleContainer),
      container.get(TransactionService),
    ]);

    // Register new moduleId as instance of the universal module.
    moduleContainer.load(UniversalTestModule, moduleId, {});
    // Immediately unload the universal module to ensure it does not run in apply().
    moduleContainer.unload(UniversalTestModule);

    const result = await createTestOverlays(args);
    for (const overlay of Object.values(result)) {
      inputService.registerOverlay(moduleId, overlay);

      const universalAction = new UniversalModelAction();
      Object.assign(universalAction, {
        constructor: { name: `${UniversalModelAction.name}For${overlay.constructor.name}` },
      });
      try {
        transactionService.unregisterOverlayActions(overlay.constructor as Constructable<UnknownOverlay>);
        transactionService.registerOverlayActions(overlay.constructor as Constructable<UnknownOverlay>, [
          universalAction,
        ]);
      } catch (error) {
        if (
          error.message !==
          `Action "${universalAction.constructor.name}" already registered for overlay "${overlay.constructor.name}"!`
        ) {
          throw error;
        }
      }
    }

    return result;
  }

  async createResources(
    moduleId: string,
    args: Parameters<typeof createResources>[0],
    options?: Parameters<typeof createResources>[1],
  ): Promise<ReturnType<typeof createResources>> {
    const container = Container.getInstance();
    const [inputService, moduleContainer] = await Promise.all([
      container.get(InputService),
      container.get(ModuleContainer),
    ]);

    // Register new moduleId as instance of the universal module.
    moduleContainer.load(UniversalTestModule, moduleId, {});
    // Immediately unload the universal module to ensure it does not run in apply().
    moduleContainer.unload(UniversalTestModule);

    const result = await createResources(args, options);
    for (const resource of Object.values(result)) {
      inputService.registerResource(moduleId, resource);
    }

    return result;
  }

  async createTestResources<S extends BaseResourceSchema[]>(
    moduleId: string,
    args: Parameters<typeof createTestResources<S>>[0],
    options?: Parameters<typeof createTestResources>[1],
  ): Promise<ReturnType<typeof createTestResources<S>>> {
    const container = Container.getInstance();
    const [inputService, moduleContainer, transactionService] = await Promise.all([
      container.get(InputService),
      container.get(ModuleContainer),
      container.get(TransactionService),
    ]);

    // Register new moduleId as instance of the universal module.
    moduleContainer.load(UniversalTestModule, moduleId, {});
    // Immediately unload the universal module to ensure it does not run in apply().
    moduleContainer.unload(UniversalTestModule);

    const result = await createTestResources(args, options);
    for (const resource of Object.values(result)) {
      inputService.registerResource(moduleId, resource);

      try {
        transactionService.registerResourceActions(resource.constructor as Constructable<UnknownResource>, [
          new UniversalResourceAction(),
        ]);
      } catch (error) {
        if (
          error.message !==
          `Action "${UniversalResourceAction.name}" already registered for resource "${resource.constructor.name}"!`
        ) {
          throw error;
        }
      }
    }

    return result;
  }

  mapTransactionActions(transaction: DiffMetadata[][]): string[][] {
    return transaction.map((i) =>
      i.map((j) => j.actions.map((a: IModelAction<any> | IResourceAction<any>) => a.constructor.name)).flat(),
    );
  }

  async initialize(
    stateProvider?: IStateProvider,
    initializeInContainer?: Parameters<typeof Octo.prototype.initialize>[1],
    excludeInContainer?: Parameters<typeof Octo.prototype.initialize>[2],
  ): Promise<void> {
    if (
      stateProvider &&
      !(
        stateProvider instanceof LocalEncryptionStateProvider ||
        stateProvider instanceof LocalStateProvider ||
        stateProvider instanceof TestStateProvider
      )
    ) {
      throw new Error('TestModuleContainer is only meant to work with LocalEncryption, Local, or Test state provider!');
    }
    this.stateProvider = stateProvider ?? new TestStateProvider();
    await this.octo.initialize(this.stateProvider, initializeInContainer, excludeInContainer);

    // Always register the UniversalTestModule to allow users to create test prerequisites.
    const moduleContainer = await Container.getInstance().get(ModuleContainer);
    moduleContainer.register(UniversalTestModule, { packageName: '@octo' });
  }

  async orderModules(modules: (Constructable<UnknownModule> | string)[]): Promise<void> {
    const moduleContainer = await Container.getInstance().get(ModuleContainer);
    moduleContainer.order(modules);
  }

  registerCapture<S extends BaseResourceSchema>(resourceContext: string, response: Partial<S['response']>): void {
    this.octo.registerCapture(resourceContext, response);
  }

  async runModule<M extends UnknownModule>(module: TestModule<M>): Promise<{ [key: string]: ModuleOutput<M> }> {
    const moduleContainer = await Container.getInstance().get(ModuleContainer);

    const moduleMetadataIndex = moduleContainer.getMetadataIndex(module.type);
    if (moduleMetadataIndex === -1) {
      moduleContainer.register(module.type, { packageName: (module.type as unknown as typeof AModule).MODULE_PACKAGE });
    }

    const moduleMetadata = moduleContainer.getMetadata(module.type)!;
    if (module.hidden === true) {
      moduleContainer.unload(moduleMetadata.module);
    } else {
      moduleContainer.load(moduleMetadata.module, module.moduleId, module.inputs);
    }

    return (await this.octo.compose()) as { [key: string]: ModuleOutput<M> };
  }

  async runModules<M extends UnknownModule>(modules: TestModule<M>[]): Promise<{ [key: string]: ModuleOutput<M> }> {
    const moduleContainer = await Container.getInstance().get(ModuleContainer);

    for (const module of modules) {
      const moduleMetadataIndex = moduleContainer.getMetadataIndex(module.type);
      if (moduleMetadataIndex === -1) {
        moduleContainer.register(module.type, {
          packageName: (module.type as unknown as typeof AModule).MODULE_PACKAGE,
        });
      }

      const moduleMetadata = moduleContainer.getMetadata(module.type)!;
      if (module.hidden === true) {
        moduleContainer.unload(moduleMetadata.module);
      } else {
        moduleContainer.load(moduleMetadata.module, module.moduleId, module.inputs);
      }
    }

    return (await this.octo.compose()) as { [key: string]: ModuleOutput<M> };
  }

  async reset(): Promise<void> {
    const container = Container.getInstance();

    // Reset ModuleContainer constructor injections.
    await container.get<InputService, typeof InputServiceFactory>(InputService, { args: [true] });
    await container.get<OverlayDataRepository, typeof OverlayDataRepositoryFactory>(OverlayDataRepository, {
      args: [true, []],
    });

    // Reset module container.
    const moduleContainer = await container.get(ModuleContainer);
    moduleContainer.reset();
  }
}
