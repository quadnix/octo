import type { Constructable, ModuleInputs, UnknownModule } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { Octo } from '../main.js';
import type { App } from '../models/app/app.model.js';
import type { CaptureService } from '../services/capture/capture.service.js';
import type { IStateProvider } from '../services/state-management/state-provider.interface.js';
import { TestStateProvider } from '../services/state-management/test.state-provider.js';
import { ModuleContainer } from './module.container.js';

export class TestModuleContainer {
  private readonly captures: CaptureService['captures'] = {};

  readonly octo: Octo;

  constructor({ captures = {} }: { captures?: TestModuleContainer['captures'] } = {}) {
    this.captures = captures;

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

    for (const [key, value] of Object.entries(this.captures)) {
      this.octo.registerCapture(key, value.response);
    }
  }

  async orderModules(modules: (Constructable<UnknownModule> | string)[]): Promise<void> {
    const moduleContainer = await Container.getInstance().get(ModuleContainer);
    moduleContainer.order(modules);
  }

  async loadModule<M extends UnknownModule>(
    modules: {
      hidden?: boolean;
      inputs: ModuleInputs<M>;
      moduleId: string;
      properties?: { [key: string]: unknown };
      type: Constructable<M>;
    }[],
  ): Promise<void> {
    const moduleContainer = await Container.getInstance().get(ModuleContainer);

    for (const moduleOverrides of modules) {
      const moduleMetadataIndex = moduleContainer.getMetadataIndex(moduleOverrides.type);
      if (moduleMetadataIndex === -1) {
        moduleContainer.register(moduleOverrides.type, moduleOverrides.properties || ({} as any));
      }

      const moduleMetadata = moduleContainer.getMetadata(moduleOverrides.type)!;
      // Override module hidden metadata.
      if (moduleOverrides.hidden === true) {
        moduleContainer.unload(moduleMetadata.module);
      } else {
        moduleContainer.load(moduleMetadata.module, moduleOverrides.moduleId, moduleOverrides.inputs);
      }
      // Override module properties.
      for (const [key, value] of Object.entries(moduleOverrides.properties || {})) {
        moduleMetadata.properties[key] = value;
      }
    }
  }
}
