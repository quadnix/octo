import type { Constructable, ModuleInputs, ModuleOutput, UnknownModule } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { Octo } from '../main.js';
import type { App } from '../models/app/app.model.js';
import type { CaptureService } from '../services/capture/capture.service.js';
import { InputService, type InputServiceFactory } from '../services/input/input.service.js';
import type { IStateProvider } from '../services/state-management/state-provider.interface.js';
import { TestStateProvider } from '../services/state-management/test.state-provider.js';
import { ModuleContainer } from './module.container.js';

export type TestModule<M extends UnknownModule> = {
  captures?: CaptureService['captures'];
  hidden?: boolean;
  inputs: ModuleInputs<M>;
  moduleId: string;
  properties?: { [key: string]: unknown };
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

  async runModule<M extends UnknownModule>(module: TestModule<M>): Promise<{ [key: string]: ModuleOutput<M> }> {
    const moduleContainer = await Container.getInstance().get(ModuleContainer);

    for (const [key, value] of Object.entries(module.captures || {})) {
      this.octo.registerCapture(key, value.response);
    }

    const moduleMetadataIndex = moduleContainer.getMetadataIndex(module.type);
    if (moduleMetadataIndex === -1) {
      moduleContainer.register(module.type, module.properties || ({} as any));
    }

    const moduleMetadata = moduleContainer.getMetadata(module.type)!;
    // Override module hidden metadata.
    if (module.hidden === true) {
      moduleContainer.unload(moduleMetadata.module);
    } else {
      moduleContainer.load(moduleMetadata.module, module.moduleId, module.inputs);
    }
    // Override module properties.
    for (const [key, value] of Object.entries(module.properties || {})) {
      moduleMetadata.properties[key] = value;
    }

    // @ts-expect-error cannot cast without awaiting on statement.
    return this.octo.compose();
  }

  private async reset(): Promise<void> {
    const container = Container.getInstance();

    await container.get<InputService, typeof InputServiceFactory>(InputService, { args: [true] });

    const moduleContainer = await container.get(ModuleContainer);
    moduleContainer.reset();
  }
}
