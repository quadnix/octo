import type { Constructable, TransactionOptions } from '../app.type.js';
import { Container } from '../decorators/container.js';
import type { Module } from '../decorators/module.decorator.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { Octo } from '../main.js';
import type { App } from '../models/app/app.model.js';
import type { IStateProvider } from '../services/state-management/state-provider.interface.js';
import { TestStateProvider } from '../services/state-management/test.state-provider.js';
import { ModuleContainer } from './module.container.js';
import type { IModule } from './module.interface.js';

export class TestModuleContainer {
  readonly octo: Octo;

  constructor() {
    this.octo = new Octo();
  }

  async commit(
    app: App,
    transactionOptions: TransactionOptions = { yieldResourceTransaction: true },
  ): Promise<{
    modelDiffs?: DiffMetadata[][];
    modelTransaction?: DiffMetadata[][];
    resourceDiffs?: DiffMetadata[][];
    resourceTransaction?: DiffMetadata[][];
  }> {
    const response: {
      modelDiffs?: DiffMetadata[][];
      modelTransaction?: DiffMetadata[][];
      resourceDiffs?: DiffMetadata[][];
      resourceTransaction?: DiffMetadata[][];
    } = {};

    const generator = await this.octo.beginTransaction(app, transactionOptions);
    if (transactionOptions.yieldModelDiffs) {
      response.modelDiffs = (await generator.next()).value;
    }
    if (transactionOptions.yieldModelTransaction) {
      response.modelTransaction = (await generator.next()).value;
    }
    if (transactionOptions.yieldResourceDiffs) {
      response.resourceDiffs = (await generator.next()).value;
    }
    if (transactionOptions.yieldResourceTransaction) {
      response.resourceTransaction = (await generator.next()).value;
    }

    const modelTransactionResult = await generator.next();
    await this.octo.commitTransaction(app, modelTransactionResult.value);

    return response;
  }

  async initialize(stateProvider?: IStateProvider): Promise<void> {
    if (stateProvider) {
      await this.octo.initialize(stateProvider);
    } else {
      await this.octo.initialize(new TestStateProvider());
    }
  }

  async mock(
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
      moduleMetadata.module = moduleOverrides.type;

      if (moduleOverrides.hidden !== undefined) {
        moduleMetadata.hidden = moduleOverrides.hidden;
      }
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
