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
 * The main entry point for Octo.
 *
 * `Octo` orchestrates the full infrastructure lifecycle: loading modules,
 * composing the model graph, diffing state, and executing transactions that
 * apply (or roll back) infrastructure changes.
 *
 * ### Typical usage
 * ```ts
 * const octo = new Octo();
 *
 * // 1. Initialize services with a state provider.
 * await octo.initialize(new FileSystemStateProvider('./state'));
 *
 * // 2. Load modules with their inputs.
 * octo.loadModule(MyRegionModule, 'my-region', { regionId: 'us-east-1' });
 *
 * // 3. Set execution order and compose the model graph.
 * octo.orderModules([['my-region']]);
 * const { app } = await octo.compose();
 *
 * // 4. Lock the app and begin the transaction.
 * const appLockId = await stateProvider.lock(app);
 * for await (const value of octo.beginTransaction(app, { appLockId })) {
 *   console.log('Transaction step:', value);
 * }
 * ```
 *
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

  /**
   * Runs the full transaction pipeline for the given `app` model graph.
   *
   * This is an async generator that yields intermediate results at each pipeline
   * stage. Which stages are yielded is controlled by the `yield*` options.
   * The generator always saves state and finalises the transaction on completion.
   *
   * Pipeline stages (in order):
   * 1. Model diffs — the computed {@link Diff} list for the model graph.
   * 2. Model transaction — the batched model action executions.
   * 3. Resource diffs — the computed diffs for the resource graph.
   * 4. Resource transaction — the batched resource action executions.
   *
   * @param app The root `App` model whose graph should be transacted.
   * @param options.appLockId The lock token obtained before calling this method.
   *   The transaction verifies this lock before executing resource actions.
   * @param options.enableResourceCapture When `true`, applies previously registered
   *   capture data instead of calling the real cloud APIs.
   * @param options.enableResourceValidation When `true`, runs validation resource actions.
   * @param options.yieldModelDiffs Yield model diffs before executing model actions.
   * @param options.yieldModelTransaction Yield model action results.
   * @param options.yieldResourceDiffs Yield resource diffs before executing resource actions.
   * @param options.yieldResourceTransaction Yield resource action results.
   * @throws {@link TransactionError} if the app is not locked.
   */
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
      throw new TransactionError('App is not in lock state!');
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

  /**
   * Executes all loaded modules in the order specified by {@link Octo.orderModules}
   * and builds the model graph.
   *
   * Must be called after {@link Octo.initialize} and {@link Octo.orderModules},
   * and before {@link Octo.beginTransaction}.
   *
   * @returns A map of module outputs keyed by `moduleId`.
   */
  async compose(): Promise<{ [key: string]: unknown }> {
    return await this.moduleContainer.apply();
  }

  /**
   * Returns the module instance registered under the given `moduleId`.
   *
   * Use this after {@link Octo.compose} to inspect or interact with a specific module.
   *
   * @param moduleId The identifier used when the module was loaded.
   * @returns The module instance, or `undefined` if not found.
   */
  getModule<M extends UnknownModule>(...args: Parameters<InputService['getModule']>): M | undefined {
    return this.inputService.getModule(...args);
  }

  /**
   * Returns all resources produced by the module registered under `moduleId`.
   *
   * Use this after {@link Octo.compose} to inspect the resources a module created.
   *
   * @param moduleId The identifier used when the module was loaded.
   * @returns The list of resources owned by that module.
   */
  getModuleResources(...args: Parameters<InputService['getModuleResources']>): UnknownResource[] {
    return this.inputService.getModuleResources(...args);
  }

  /**
   * Initializes all Octo internal services using the provided state provider.
   *
   * This is the first method you must call on a new `Octo` instance.
   * It resolves all service factories, loads any previously persisted resource
   * state, and prepares the container for module execution.
   *
   * @param stateProvider The state provider used to read/write model and resource state.
   * @param initializeInContainer Additional container entries to resolve during startup.
   * @param excludeInContainer Factory types to unregister before startup (useful for overrides).
   */
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

  /**
   * Registers a module to be executed during {@link Octo.compose}.
   *
   * The `moduleId` uniquely identifies this module instance and is used to
   * reference it in {@link Octo.orderModules}, {@link Octo.getModule}, and
   * {@link Octo.getModuleResources}. The `inputs` must satisfy the module's schema.
   *
   * @param module The module class (or its registered name string) to load.
   * @param moduleId A unique identifier for this module instance.
   * @param inputs The validated input values for this module.
   */
  loadModule<M extends UnknownModule>(
    module: Constructable<M> | string,
    moduleId: string,
    inputs: ModuleSchemaInputs<M>,
  ): void {
    this.moduleContainer.load(module, moduleId, inputs);
  }

  /**
   * Defines the execution order of loaded modules.
   *
   * Modules are executed in the order of the provided list during
   * {@link Octo.compose}. This must be called before `compose()`.
   *
   * @param args Module ordering arguments forwarded to `ModuleContainer.order`.
   */
  orderModules(...args: Parameters<ModuleContainer['order']>): ReturnType<ModuleContainer['order']> {
    this.moduleContainer.order(...args);
  }

  /**
   * Pre-registers a captured resource response for replay.
   *
   * When `enableResourceCapture` is `true` in {@link Octo.beginTransaction},
   * Octo will use these captured responses instead of calling the real cloud
   * APIs. Useful for dry-runs, tests, or replaying known state without
   * incurring cloud costs.
   *
   * @param resourceContext The context string identifying the target resource.
   * @param response The partial response to replay for that resource.
   */
  registerCapture<S extends BaseResourceSchema>(resourceContext: string, response: Partial<S['response']>): void {
    this.captureService.registerCapture(resourceContext, response);
  }

  /**
   * Registers transaction-level lifecycle hooks.
   *
   * Hooks are applied globally across all modules and fire around model actions,
   * resource actions, and commit events. Use this as an alternative to
   * per-module {@link AModule.registerHooks} when you need cross-cutting concerns.
   *
   * @param args Hook registration arguments forwarded to `ModuleContainer.registerHooks`.
   */
  registerHooks(...args: Parameters<ModuleContainer['registerHooks']>): ReturnType<ModuleContainer['registerHooks']> {
    this.moduleContainer.registerHooks(...args);
  }

  /**
   * Registers a schema translation so that a newer schema can be read as an older one (or vice versa).
   *
   * Use this to maintain backwards compatibility when a model or resource schema
   * evolves across releases. The translation function maps from the old schema
   * shape to the current one during deserialization.
   *
   * @param args Translation arguments forwarded to `SchemaTranslationService.registerSchemaTranslation`.
   * @returns A handle that can be used to unregister the translation.
   */
  registerSchemaTranslation(
    ...args: Parameters<SchemaTranslationService['registerSchemaTranslation']>
  ): ReturnType<SchemaTranslationService['registerSchemaTranslation']> {
    return this.schemaTranslationService.registerSchemaTranslation(...args);
  }

  /**
   * Registers tags to be applied to resources.
   *
   * Tags can be scoped to a specific module (`moduleId`), a specific resource
   * (`resourceContext`), or applied globally when neither scope is set.
   * Tags are merged onto matching resources before resource actions execute.
   *
   * @param args An array of `{ scope, tags }` entries to register.
   */
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
