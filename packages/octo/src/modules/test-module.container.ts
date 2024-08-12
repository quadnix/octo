import type { Constructable } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import type { Module } from '../decorators/module.decorator.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { Octo } from '../main.js';
import type { App } from '../models/app/app.model.js';
import type { CaptureService } from '../services/capture/capture.service.js';
import type { InputService } from '../services/input/input.service.js';
import type { IStateProvider } from '../services/state-management/state-provider.interface.js';
import { TestStateProvider } from '../services/state-management/test.state-provider.js';
import { ModuleContainer } from './module.container.js';
import type { IModule } from './module.interface.js';

export class TestModuleContainer {
  private readonly captures: CaptureService['captures'] = {};

  private readonly inputs: InputService['inputs'] = {};

  readonly octo: Octo;

  constructor({
    inputs = {},
    captures = {},
  }: { captures?: TestModuleContainer['captures']; inputs?: TestModuleContainer['inputs'] } = {}) {
    this.captures = captures;
    this.inputs = inputs;

    this.octo = new Octo();
  }

  async commit(app: App): Promise<{
    dirtyResourceDiffs: DiffMetadata[][];
    dirtyResourceTransaction: DiffMetadata[][];
    modelDiffs: DiffMetadata[][];
    modelTransaction: DiffMetadata[][];
    resourceDiffs: DiffMetadata[][];
    resourceTransaction: DiffMetadata[][];
  }> {
    const generator = await this.octo.beginTransaction(app, {
      enableResourceCapture: true,
      yieldDirtyResourceDiffs: true,
      yieldDirtyResourceTransaction: true,
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
    response.dirtyResourceDiffs = (await generator.next()).value;
    response.dirtyResourceTransaction = (await generator.next()).value;
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

    this.octo.registerInputs(this.inputs);
  }

  async loadModules(
    modules: {
      hidden?: boolean;
      properties?: Parameters<typeof Module>[0];
      type: Constructable<IModule<unknown>>;
    }[],
  ): Promise<void> {
    const moduleContainer = await Container.get(ModuleContainer);

    for (const moduleOverrides of modules) {
      const moduleMetadataIndex = moduleContainer.getModuleMetadataIndex(moduleOverrides.type);
      if (moduleMetadataIndex === -1) {
        moduleContainer.register(moduleOverrides.type, moduleOverrides.properties || {});
      }

      const moduleMetadata = moduleContainer.getModuleMetadata(moduleOverrides.type)!;
      // Override module hidden metadata.
      if (moduleOverrides.hidden === true) {
        moduleContainer.unload(moduleMetadata.module);
      } else {
        moduleContainer.load(moduleMetadata.module);
      }
      // Override module properties.
      for (const [key, value] of Object.entries(moduleOverrides.properties || {})) {
        moduleMetadata.properties[key] = value;
      }
    }

    await this.octo.compose();
  }

  async reset(): Promise<void> {
    const moduleContainer = await Container.get(ModuleContainer);
    moduleContainer.reset();
  }
}
