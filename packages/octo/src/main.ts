import { strict as assert } from 'assert';
import type {
  Constructable,
  ModuleSchemaInputs,
  TransactionOptions,
  UnknownModule,
  UnknownResource,
} from './app.type.js';
import { EnableHook } from './decorators/enable-hook.decorator.js';
import { TransactionError } from './errors/index.js';
import { Container } from './functions/container/container.js';
import { DiffMetadata } from './functions/diff/diff-metadata.js';
import { App } from './models/app/app.model.js';
import { ModuleContainer } from './modules/module.container.js';
import { OverlayDataRepository, OverlayDataRepositoryFactory } from './overlays/overlay-data.repository.js';
import { BaseResourceSchema } from './resources/resource.schema.js';
import { CaptureService } from './services/capture/capture.service.js';
import { InputService } from './services/input/input.service.js';
import { SchemaTranslationService } from './services/schema-translation/schema-translation.service.js';
import { ModelSerializationService } from './services/serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from './services/serialization/resource/resource-serialization.service.js';
import {
  StateManagementService,
  StateManagementServiceFactory,
} from './services/state-management/state-management.service.js';
import type { IStateProvider } from './services/state-management/state-provider.interface.js';
import { TransactionService } from './services/transaction/transaction.service.js';

/**
 * @group Main
 */
export class Octo {
  private readonly modelStateFileName: string = 'models.json';
  private readonly actualResourceStateFileName: string = 'resources-actual.json';
  private readonly oldResourceStateFileName: string = 'resources-old.json';

  private captureService: CaptureService;
  private inputService: InputService;
  private modelSerializationService: ModelSerializationService;
  private moduleContainer: ModuleContainer;
  private resourceSerializationService: ResourceSerializationService;
  private schemaTranslationService: SchemaTranslationService;
  private stateManagementService: StateManagementService;
  private transactionService: TransactionService;

  async *beginTransaction(
    app: App,
    {
      appLockId = undefined,
      enableResourceCapture = false,
      enableResourceValidation = false,
      yieldModelDiffs = false,
      yieldModelTransaction = false,
      yieldResourceDiffs = false,
      yieldResourceTransaction = false,
    }: TransactionOptions & { appLockId?: string } = {},
  ): ReturnType<TransactionService['beginTransaction']> {
    const diffs = await app.diff();
    const transaction = this.transactionService.beginTransaction(diffs, {
      enableResourceCapture,
      enableResourceValidation,
      yieldModelDiffs: true,
      yieldModelTransaction: true,
      yieldResourceDiffs: true,
      yieldResourceTransaction: true,
    });

    const modelDiffs = await transaction.next();
    if (yieldModelDiffs) {
      yield modelDiffs.value;
    }

    const modelTransaction = await transaction.next();
    if (yieldModelTransaction) {
      yield modelTransaction.value;
    }

    const resourceDiffs = await transaction.next();
    if (yieldResourceDiffs) {
      yield resourceDiffs.value;
    }

    if (!appLockId) {
      return resourceDiffs.value;
    }

    const isAppLocked = await this.stateManagementService.isAppLocked(appLockId);
    if (!isAppLocked) {
      throw new TransactionError('App is not in lock state!');
    }
    await this.stateManagementService.updateAppLockTransaction(appLockId);

    let resourceTransaction:
      | IteratorYieldResult<DiffMetadata[][]>
      | IteratorReturnResult<DiffMetadata[][]>
      | undefined = undefined;
    try {
      resourceTransaction = await transaction.next();
      if (yieldResourceTransaction) {
        yield resourceTransaction.value;
      }

      return (await transaction.next()).value;
    } finally {
      await this.commitTransaction(app, modelTransaction.value, resourceTransaction ? resourceTransaction.value : []);
    }
  }

  @EnableHook('CommitHook')
  private async commitTransaction(
    app: App,
    modelTransaction: DiffMetadata[][],
    resourceTransaction: DiffMetadata[][] = [],
  ): Promise<void> {
    // `modelTransaction` and `resourceTransaction` is used by hooks of type CommitHook.
    assert(!!modelTransaction);
    assert(!!resourceTransaction);

    // Save the state of the new app and its resources.
    await this.saveModelState(app);
    await this.saveResourceState();

    // Reset the runtime environment with the latest state.
    await this.retrieveResourceState();
  }

  async compose(): Promise<{ [key: string]: unknown }> {
    return await this.moduleContainer.apply();
  }

  getModule<M extends UnknownModule>(...args: Parameters<InputService['getModule']>): M | undefined {
    return this.inputService.getModule(...args);
  }

  getModuleResources(...args: Parameters<InputService['getModuleResources']>): UnknownResource[] {
    return this.inputService.getModuleResources(...args);
  }

  async initialize(
    stateProvider: IStateProvider,
    initializeInContainer: {
      type: Parameters<Container['get']>[0];
      options?: Parameters<Container['get']>[1];
    }[] = [],
    excludeInContainer: {
      type: Parameters<Container['unRegisterFactory']>[0];
    }[] = [],
  ): Promise<void> {
    const container = Container.getInstance();

    [
      this.captureService,
      this.inputService,
      this.modelSerializationService,
      this.moduleContainer,
      this.resourceSerializationService,
      this.schemaTranslationService,
      this.stateManagementService,
      this.transactionService,
    ] = await Promise.all([
      container.get(CaptureService),
      container.get(InputService),
      container.get(ModelSerializationService),
      container.get(ModuleContainer),
      container.get(ResourceSerializationService),
      container.get(SchemaTranslationService),
      container.get<StateManagementService, typeof StateManagementServiceFactory>(StateManagementService, {
        args: [stateProvider],
      }),
      container.get(TransactionService),
    ]);

    for (const exclude of excludeInContainer) {
      container.unRegisterFactory(exclude.type);
    }
    for (const initialize of initializeInContainer) {
      await container.get(initialize.type, initialize.options as any);
    }

    // Wait for all factories and startup promises to resolve.
    await container.waitToResolveAllFactories();

    // Reset the runtime environment with the latest state.
    await this.retrieveResourceState();
  }

  loadModule<M extends UnknownModule>(
    module: Constructable<M> | string,
    moduleId: string,
    inputs: ModuleSchemaInputs<M>,
  ): void {
    this.moduleContainer.load(module, moduleId, inputs);
  }

  orderModules(...args: Parameters<ModuleContainer['order']>): ReturnType<ModuleContainer['order']> {
    this.moduleContainer.order(...args);
  }

  registerCapture<S extends BaseResourceSchema>(resourceContext: string, response: Partial<S['response']>): void {
    this.captureService.registerCapture(resourceContext, response);
  }

  registerHooks(...args: Parameters<ModuleContainer['registerHooks']>): ReturnType<ModuleContainer['registerHooks']> {
    this.moduleContainer.registerHooks(...args);
  }

  registerSchemaTranslation(
    ...args: Parameters<SchemaTranslationService['registerSchemaTranslation']>
  ): ReturnType<SchemaTranslationService['registerSchemaTranslation']> {
    return this.schemaTranslationService.registerSchemaTranslation(...args);
  }

  registerTags(
    args: { scope: { moduleId?: string; resourceContext?: string }; tags: { [key: string]: string } }[],
  ): void {
    for (const { scope, tags } of args) {
      const isGlobal = !scope.moduleId && !scope.resourceContext;
      this.inputService.registerTag((isGlobal || scope) as Parameters<InputService['registerTag']>[0], tags);
    }
  }

  private async retrieveResourceState(): Promise<void> {
    const { data: actualSerializedOutput } = await this.stateManagementService.getResourceState(
      this.actualResourceStateFileName,
    );
    const { data: oldSerializedOutput } = await this.stateManagementService.getResourceState(
      this.oldResourceStateFileName,
    );

    // Initialize previous resource state.
    await this.resourceSerializationService.deserialize(actualSerializedOutput, oldSerializedOutput);
  }

  private async saveModelState(app: App): Promise<void> {
    const modelSerializedOutput = await this.modelSerializationService.serialize(app);
    await this.stateManagementService.saveModelState(this.modelStateFileName, modelSerializedOutput, {
      version: 1,
    });

    await Container.getInstance().get<OverlayDataRepository, typeof OverlayDataRepositoryFactory>(
      OverlayDataRepository,
      { args: [true] },
    );
  }

  private async saveResourceState(): Promise<void> {
    const actualSerializedOutput = await this.resourceSerializationService.serializeActualResources();
    await this.stateManagementService.saveResourceState(this.actualResourceStateFileName, actualSerializedOutput, {
      version: 1,
    });

    const oldSerializedOutput = await this.resourceSerializationService.serializeNewResources();
    await this.stateManagementService.saveResourceState(this.oldResourceStateFileName, oldSerializedOutput, {
      version: 1,
    });
  }
}
