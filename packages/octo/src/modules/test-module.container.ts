import type { Constructable, ModuleOutput, ModuleSchema, UnknownModule } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { Octo } from '../main.js';
import type { App } from '../models/app/app.model.js';
import { OverlayDataRepository, type OverlayDataRepositoryFactory } from '../overlays/overlay-data.repository.js';
import type { BaseResourceSchema } from '../resources/resource.schema.js';
import { InputService, type InputServiceFactory } from '../services/input/input.service.js';
import type { IStateProvider } from '../services/state-management/state-provider.interface.js';
import { TestStateProvider } from '../services/state-management/test.state-provider.js';
import { create } from '../utilities/test-helpers/test-models.js';
import type { AModule } from './module.abstract.js';
import { ModuleContainer } from './module.container.js';

export type TestModule<M extends UnknownModule> = {
  hidden?: boolean;
  inputs: Record<keyof ModuleSchema<M>, string>;
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
    const inputService = await container.get(InputService);

    const result = create(args);
    for (const models of Object.values(result)) {
      for (const model of models) {
        inputService.registerModel(moduleId, model);
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
