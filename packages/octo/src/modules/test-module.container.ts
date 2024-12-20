import type {
  ActionOutputs,
  Constructable,
  ModuleOutput,
  ModuleSchemaInputs,
  UnknownModel,
  UnknownModule,
  UnknownResource,
} from '../app.type.js';
import { Container } from '../functions/container/container.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { Octo } from '../main.js';
import type { App } from '../models/app/app.model.js';
import type { IModelAction } from '../models/model-action.interface.js';
import { OverlayDataRepository, type OverlayDataRepositoryFactory } from '../overlays/overlay-data.repository.js';
import type { IResourceAction } from '../resources/resource-action.interface.js';
import type { BaseResourceSchema } from '../resources/resource.schema.js';
import { InputService, type InputServiceFactory } from '../services/input/input.service.js';
import type { IStateProvider } from '../services/state-management/state-provider.interface.js';
import { TestStateProvider } from '../services/state-management/test.state-provider.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import { create } from '../utilities/test-helpers/test-models.js';
import { createTestResources } from '../utilities/test-helpers/test-resources.js';
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

export type TestModule<M extends UnknownModule> = {
  hidden?: boolean;
  inputs: ModuleSchemaInputs<M>;
  moduleId: string;
  type: Constructable<M>;
};

export class TestModuleContainer {
  private readonly octo: Octo;

  constructor() {
    this.octo = new Octo();
  }

  async commit(
    app: App,
    { enableResourceCapture = false } = {},
  ): Promise<{
    modelDiffs: DiffMetadata[][];
    modelTransaction: DiffMetadata[][];
    resourceDiffs: DiffMetadata[][];
    resourceTransaction: DiffMetadata[][];
  }> {
    const generator = this.octo.beginTransaction(app, {
      enableResourceCapture,
      yieldModelDiffs: true,
      yieldModelTransaction: true,
      yieldResourceDiffs: true,
      yieldResourceTransaction: true,
    });

    const response = {} as Awaited<ReturnType<TestModuleContainer['commit']>>;
    response.modelDiffs = (await generator.next()).value;
    response.modelTransaction = (await generator.next()).value;
    response.resourceDiffs = (await generator.next()).value;
    response.resourceTransaction = (await generator.next()).value;
    await generator.next();

    await this.reset();

    return response;
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
      for (const model of models) {
        inputService.registerModel(moduleId, model);

        try {
          transactionService.registerModelActions(model.constructor as Constructable<UnknownModel>, [
            new UniversalModelAction(),
          ]);
        } catch (error) {
          if (
            error.message !==
            `Action "${UniversalModelAction.name}" already registered for model "${model.constructor.name}"!`
          ) {
            throw error;
          }
        }
      }
    }

    return result;
  }

  async createTestResources(
    moduleId: string,
    args: Parameters<typeof createTestResources>[0],
    options?: Parameters<typeof createTestResources>[1],
  ): Promise<ReturnType<typeof createTestResources>> {
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

  async initialize(
    stateProvider?: IStateProvider,
    initializeInContainer?: Parameters<typeof Octo.prototype.initialize>[1],
    excludeInContainer?: Parameters<typeof Octo.prototype.initialize>[2],
  ): Promise<void> {
    if (stateProvider) {
      await this.octo.initialize(stateProvider, initializeInContainer, excludeInContainer);
    } else {
      await this.octo.initialize(new TestStateProvider(), initializeInContainer, excludeInContainer);
    }

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
