import { strict as assert } from 'assert';
import type {
  Constructable,
  ModuleSchemaInputs,
  TerraformFolderOutput,
  TerraformResourceOutput,
  UnknownModule,
  UnknownResource,
} from './app.type.js';
import { EnableHook } from './decorators/enable-hook.decorator.js';
import {
  CommitModeCompletedEvent,
  type ModeEventPayload,
  ModeFailedEvent,
  ModeFinishedEvent,
  ModeStartedEvent,
  type OctoMode,
  TerraformFoldersWrittenEvent,
  ValidateModeCompletedEvent,
} from './events/index.js';
import { Container } from './functions/container/container.js';
import { DiffMetadata } from './functions/diff/diff-metadata.js';
import { App } from './models/app/app.model.js';
import { type ModelTransactionResult, applyModelTransaction } from './modes/apply-transaction.js';
import { type TerraformOutputs, commit as runCommit } from './modes/commit.mode.js';
import { generate as runGenerate } from './modes/generate.mode.js';
import { runAction as runRunAction } from './modes/run-action.mode.js';
import { type TerraformPlan, validate as runValidate } from './modes/validate.mode.js';
import { ModuleContainer } from './modules/module.container.js';
import { EventService } from './services/event/event.service.js';
import { InputService } from './services/input/input.service.js';
import { SchemaTranslationService } from './services/schema-translation/schema-translation.service.js';
import { ModelSerializationService } from './services/serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from './services/serialization/resource/resource-serialization.service.js';
import {
  StateManagementService,
  StateManagementServiceFactory,
} from './services/state-management/state-management.service.js';
import type { IStateProvider } from './services/state-management/state-provider.interface.js';
import { TerraformService } from './services/terraform/terraform.service.js';

/**
 * @group Main
 */
export class Octo {
  private readonly actualResourceStateFileName: string = 'resources-actual.json';
  private eventService: EventService;
  private inputService: InputService;
  private modelSerializationService: ModelSerializationService;

  private readonly modelStateFileName: string = 'models.json';
  private moduleContainer: ModuleContainer;
  private readonly oldResourceStateFileName: string = 'resources-old.json';
  private resourceSerializationService: ResourceSerializationService;
  private schemaTranslationService: SchemaTranslationService;
  private stateManagementService: StateManagementService;
  private terraformService: TerraformService;

  /**
   * The last and final step of the octo lifecycle - this function commits the result of a `terraform apply`
   * back into octo's state.
   *
   * The Terraform apply generates a `.tfstate` file that contains the metadata of each resource it created.
   * Some of that metadata maps directly into octo's resource's response.
   * This function takes those response objects - per octo resource,
   * and also the previous state, and it updates octo state files (model + resources) with this data.
   *
   * **All-or-nothing**: the function errors before mutating anything if an expected output is missing,
   * leaving state untouched. Outputs supplied for a folder octo does not track (not in intent or committed
   * state) are ignored — returned as warnings for the caller to surface.
   */
  async commit(
    app: App,
    options: { outputs: Map<string, TerraformOutputs> },
    transaction?: ModelTransactionResult,
  ): Promise<Pick<Awaited<ReturnType<typeof runCommit>>, 'warnings'>> {
    return this.runMode('commit', app.name, async () => {
      const { userData } = await this.stateManagementService.getResourceState(this.actualResourceStateFileName);

      // Build the transaction unless a single-process driver already built it and passed it in.
      const resolvedTransaction = transaction ?? (await applyModelTransaction(app));
      const { modelTransaction, ...completed } = await runCommit({
        ...options,
        previousFolders: userData.terraformFolders ?? [],
        previousMappings: userData.terraformResources ?? [],
        transaction: resolvedTransaction,
      });

      // Emitted after the state is persisted, so a listener never sees an uncommitted commit.
      await this.commitTransaction(app, modelTransaction, []);
      this.eventService.emit(new CommitModeCompletedEvent(undefined, completed));

      return { warnings: completed.warnings };
    });
  }

  /**
   * This function runs all the modules you loaded using {@link loadModule} function,
   * in the order determined by the {@link orderModules} function.
   *
   * @returns object A map of each model or overlay that all modules have created, keyed by a unique id,
   * and the value is the actual model or overlay object.
   */
  async compose(): Promise<{ [key: string]: unknown }> {
    return await this.moduleContainer.apply();
  }

  /**
   * The first step of the octo lifecycle - this method generates TerraGrunt module folders
   * representing the full desired infrastructure captured as IaC, and also saves the current model state.
   *
   * - If a previous model state exists, folders recorded by the previous generate or the last commit
   * that the current intent no longer fills are **emptied** — rewritten with their recorded provider
   * blocks and no resources — so a later terraform apply destroys their live infrastructure instead of
   * orphaning it.
   * - A new module is captured in a new folder.
   * - An updated module is rewritten in its existing folder.
   *
   * Octo never deletes a folder.
   */
  async generate(
    app: App,
    options: { outputDir: string },
    transaction?: ModelTransactionResult,
  ): ReturnType<typeof runGenerate> {
    return this.runMode('generate', app.name, async () => {
      // The previous folder records must be read before this run writes the new `models.json`, so a
      // module deleted from intent is caught on the generate right after its removal.
      const [{ userData: modelUserData }, { userData: actualResourceUserData }] = await Promise.all([
        this.stateManagementService.getModelState(this.modelStateFileName),
        this.stateManagementService.getResourceState(this.actualResourceStateFileName),
      ]);
      const previousFolders = new Map<string, TerraformFolderOutput>();
      for (const record of [
        ...(actualResourceUserData.terraformFolders ?? []),
        ...(modelUserData.terraformFolders ?? []),
      ]) {
        previousFolders.set(record.moduleId, record);
      }

      // Build the transaction unless a single-process driver already built it and passed it in.
      const resolvedTransaction = transaction ?? (await applyModelTransaction(app));
      const previousFolderList = [...previousFolders.values()];
      const resourceDiffs = await runGenerate({
        ...options,
        previousFolders: previousFolderList,
        transaction: resolvedTransaction,
      });

      const written = this.terraformService.getModuleIds();
      this.eventService.emit(
        new TerraformFoldersWrittenEvent(undefined, {
          emptied: previousFolderList
            .map((folder) => folder.moduleId)
            .filter((moduleId) => !written.includes(moduleId)),
          outputDir: options.outputDir,
          written,
        }),
      );

      await this.saveModelState(app);
      return resourceDiffs;
    });
  }

  /**
   * This function can fetch a registered module by its module ID.
   *
   * @returns The module itself, or undefined if not found.
   */
  getModule<M extends UnknownModule>(...args: Parameters<InputService['getModule']>): M | undefined {
    return this.inputService.getModule(...args);
  }

  /**
   * This function can retrieve resources associated with a specific module, queried by the module ID.
   *
   * @returns Array of resource objects this module generated.
   */
  getModuleResources(...args: Parameters<InputService['getModuleResources']>): UnknownResource[] {
    return this.inputService.getModuleResources(...args);
  }

  /**
   * This function derives the root of the model graph - the one and only `App` any loaded module
   * produced. Call after {@link compose}.
   *
   * @returns The root {@link App} model.
   * @throws If no app model, or more than one distinct app model, has been registered.
   */
  getRootModel(): App {
    return this.inputService.getRootModel() as App;
  }

  /**
   * This function allows the {@link Octo} class to be initialized with a
   * state provider {@link IStateProvider}, and optional registration or exclusion
   * of custom Factories {@link Factory} created by you.
   *
   * The exclusion always runs first by design - allowing you to un-register an existing Factory,
   * and supplying your own.
   */
  async initialize(
    stateProvider: IStateProvider,
    initializeInContainer: {
      options?: Parameters<Container['get']>[1];
      type: Parameters<Container['get']>[0];
    }[] = [],
    excludeInContainer: {
      type: Parameters<Container['unRegisterFactory']>[0];
    }[] = [],
  ): Promise<void> {
    const container = Container.getInstance();

    [
      this.eventService,
      this.inputService,
      this.modelSerializationService,
      this.moduleContainer,
      this.resourceSerializationService,
      this.schemaTranslationService,
      this.stateManagementService,
      this.terraformService,
    ] = await Promise.all([
      container.get(EventService),
      container.get(InputService),
      container.get(ModelSerializationService),
      container.get(ModuleContainer),
      container.get(ResourceSerializationService),
      container.get(SchemaTranslationService),
      container.get<StateManagementService, typeof StateManagementServiceFactory>(StateManagementService, {
        args: [stateProvider],
      }),
      container.get(TerraformService),
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
   * This function allows loading of modules into octo's memory, to be applied by the {@link compose} function.
   *
   * By supplying the module's class, its module ID, and the inputs,
   * you bind the module to its unique Constructor,
   * so that identically named modules won't get mixed up.
   */
  loadModule<M extends UnknownModule>(
    module: Constructable<M> | string,
    moduleId: string,
    inputs: ModuleSchemaInputs<M>,
  ): void {
    this.moduleContainer.load(module, moduleId, inputs);
  }

  /**
   * This function defines the order in which the loaded modules are executed by the {@link compose} function.
   *
   * You supply the same Constructors you passed to {@link loadModule} to define the order.
   */
  orderModules(...args: Parameters<ModuleContainer['order']>): ReturnType<ModuleContainer['order']> {
    this.moduleContainer.order(...args);
  }

  /**
   * Octo allows several locations where a custom function can be injected to
   * modify the default behavior of the framework.
   *
   * This function allows those hooks to be registered from this one place.
   * Octo will invoke those hooks when the appropriate lifecycle event occurs.
   *
   * There are several hook-points that Octo provides.
   * Each hook's signature depends on the hook type.
   * - PreCommitHook: invoked before the commit process starts.
   * - PostCommitHook: invoked after the commit process completes.
   * - PreModelActionHook: invoked before a model action is about to start.
   * - PostModelActionHook: invoked after a model action completes.
   * - PreResourceActionHook: invoked before a resource action is about to start.
   * - PostResourceActionHook: invoked after a resource action completes.
   *
   * @see Definition of [Hooks](/docs/fundamentals/modules#hooks).
   */
  registerHooks(...args: Parameters<ModuleContainer['registerHooks']>): ReturnType<ModuleContainer['registerHooks']> {
    this.moduleContainer.registerHooks(...args);
  }

  /**
   * Octo recognizes and embraces the fact that modules are created by different authors.
   * When a module depends on another author's module,
   * they reference the parent modules using various `Schema`.
   *
   * If the parent module's schema changes, other modules could easily break.
   * In very specialized situations, you can control Schema by providing a translation layer.
   * In simple words, it allows you to transform a Schema to another Schema.
   *
   * This function allows the registration of both the schemas and the translation layer.
   */
  registerSchemaTranslation(
    ...args: Parameters<SchemaTranslationService['registerSchemaTranslation']>
  ): ReturnType<SchemaTranslationService['registerSchemaTranslation']> {
    return this.schemaTranslationService.registerSchemaTranslation(...args);
  }

  /**
   * This function allows you to register tags for your resources on a more global scale.
   *
   * You can target tags to,
   * - Apply to ALL modules and ALL its resources.
   * - Target a specific module and ALL its resources.
   * - Target a specific resource.
   *
   * The `scope` can be set empty for global, or targeted to a specific module or resource.
   * The second argument is for supplying the tags themselves.
   */
  registerTags(
    args: { scope: { moduleId?: string; resourceContext?: string }; tags: { [key: string]: string } }[],
  ): void {
    for (const { scope, tags } of args) {
      const isGlobal = !scope.moduleId && !scope.resourceContext;
      this.inputService.registerTag((isGlobal || scope) as Parameters<InputService['registerTag']>[0], tags);
    }
  }

  /**
   * Sets the minimum terraform version and the `required_providers` sources/versions rendered
   * into every generated module folder.
   *
   * Call after `initialize()`, before `generate()`.
   */
  registerTerraformConfig(
    ...args: Parameters<TerraformService['addTerraformConfig']>
  ): ReturnType<TerraformService['addTerraformConfig']> {
    return this.terraformService.addTerraformConfig(...args);
  }

  /**
   * Registers a terraform provider block for a deployment target (provider type + account + region).
   * Resources bind to providers by `{ accountId, regionId }` alone — registration is
   * the one place a provider type is named.
   *
   * Call after `initialize()`, before `generate()`.
   */
  registerTerraformProvider(
    ...args: Parameters<TerraformService['addTerraformProvider']>
  ): ReturnType<TerraformService['addTerraformProvider']> {
    return this.terraformService.addTerraformProvider(...args);
  }

  /**
   * This function runs a single resource action, invoked by terraform mid-apply for an external resource.
   */
  async runAction(
    app: App,
    options: { inputs?: Record<string, unknown>; resourceId: string },
  ): ReturnType<typeof runRunAction> {
    return runRunAction(app, options);
  }

  /**
   * The second step of the octo lifecycle - this function correlates the generated terraform plans
   * with octo's resource diff and reports what it finds.
   *
   * The report answers two questions separately:
   * 1. What will change, and why — including terraform changes octo did not flag directly but can
   *    attribute to something it did (a referenced resource whose identity moved, or an address the
   *    resource no longer renders).
   * 2. What changed that intent does *not* explain — drift, i.e. infrastructure modified outside
   *    octo. Read {@link ValidateReport.confidence} first: drift detection is only reliable when
   *    intent itself is unchanged.
   *
   * The report is unsuccessful only when terraform could not plan a folder octo generated
   * ({@link ValidateReport.failures}). Folders octo does not track are excluded and noted.
   *
   * Pass the whole result of `TerraformUtility.plan(dir, { json: true })`, whose `errors` map carries
   * terraform's own message for each folder that failed.
   */
  async validate(
    app: App,
    { errors: planErrors, plans }: { errors?: Map<string, string>; plans: Map<string, TerraformPlan> },
    transaction?: ModelTransactionResult,
  ): ReturnType<typeof runValidate> {
    return this.runMode('validate', app.name, async () => {
      const { userData } = await this.stateManagementService.getResourceState(this.actualResourceStateFileName);
      const { terraformFolders, terraformResources } = userData;

      const previousMappings = terraformResources ?? [];
      const persistedMappings = new Map<string, TerraformResourceOutput>();
      for (const mapping of previousMappings) {
        persistedMappings.set(mapping.resourceContext, mapping);
      }

      // Build the transaction unless a single-process driver already built it and passed it in.
      const resolvedTransaction = transaction ?? (await applyModelTransaction(app));
      const report = await runValidate({
        persistedMappings,
        planErrors,
        plans,
        previousFolders: terraformFolders ?? [],
        transaction: resolvedTransaction,
      });

      this.eventService.emit(new ValidateModeCompletedEvent(undefined, { report }));

      return report;
    });
  }

  /**
   * This function persists the model and resource state using {@link IStateProvider}.
   * Then immediately fetches the resource state in memory for the next set of operations.
   *
   * @internal
   */
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
   * This function deserializes the resource state in memory.
   * It deserializes the actual resource state into actual resources,
   * and the last resource state into old resources.
   *
   * @internal
   */
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

  /**
   * Wraps a mode to emit its boundary events, and re-throws whatever the mode threw.
   * The finishing events use `emitAndWait`, so a listener that writes a file completes first.
   *
   * @internal
   */
  private async runMode<T>(mode: OctoMode, appName: string | undefined, body: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    const payload: ModeEventPayload = { appName, mode };

    this.eventService.emit(new ModeStartedEvent(mode, payload));

    let result: T;
    try {
      result = await body();
    } catch (error) {
      await this.eventService.emitAndWait(
        new ModeFailedEvent(mode, {
          ...payload,
          durationInMs: Date.now() - startedAt,
          error: error?.message ?? String(error),
        }),
      );
      throw error;
    }

    await this.eventService.emitAndWait(
      new ModeFinishedEvent(mode, { ...payload, durationInMs: Date.now() - startedAt }),
    );
    return result;
  }

  /**
   * This function persists the in-memory model state.
   *
   * @internal
   */
  private async saveModelState(app: App): Promise<void> {
    const modelSerializedOutput = await this.modelSerializationService.serialize(app);
    await this.stateManagementService.saveModelState(this.modelStateFileName, modelSerializedOutput, {
      terraformFolders: this.terraformService.getFolderRecords(),
      version: 1,
    });
  }

  /**
   * This function persists the in-memory resource state.
   * The actual resource state is persisted as actual,
   * and the current resource state is persisted as old.
   *
   * @internal
   */
  private async saveResourceState(): Promise<void> {
    const actualSerializedOutput = await this.resourceSerializationService.serializeActualResources();
    await this.stateManagementService.saveResourceState(this.actualResourceStateFileName, actualSerializedOutput, {
      terraformFolders: this.terraformService.getFolderRecords(),
      terraformResources: this.terraformService.getOctoTerraformResourceMappings().map(
        (m): TerraformResourceOutput => ({
          moduleId: m.moduleId,
          resourceContext: m.resourceContext,
          resourceId: m.resourceId,
          terraformAddresses: m.terraformAddresses,
        }),
      ),
      version: 1,
    });

    const oldSerializedOutput = await this.resourceSerializationService.serializeNewResources();
    await this.stateManagementService.saveResourceState(this.oldResourceStateFileName, oldSerializedOutput, {
      version: 1,
    });
  }
}
